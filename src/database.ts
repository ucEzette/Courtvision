import Database from '@tauri-apps/plugin-sql';
import { isTauri } from './lib/platform';
import { webQuery, webExecute } from './lib/db-web';

let tauriDb: Database | null = null;

export async function getTauriDb(): Promise<Database> {
  if (!tauriDb) {
    tauriDb = await Database.load('sqlite:courtvision.db');
    await runMigrations(tauriDb);
  }
  return tauriDb;
}

async function runMigrations(database: Database): Promise<void> {
  await database.execute(`
    CREATE TABLE IF NOT EXISTS videos (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      file_path TEXT NOT NULL UNIQUE,
      file_name TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  await database.execute(`
    CREATE TABLE IF NOT EXISTS clips (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      video_id INTEGER NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
      clip_type TEXT NOT NULL CHECK(clip_type IN ('Offense','Defense')),
      label TEXT,
      start_time REAL NOT NULL,
      end_time REAL NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);

  // Safely run migration to add 'label' column if it doesn't exist on older databases
  await database.execute('ALTER TABLE clips ADD COLUMN label TEXT').catch(() => {});

  await database.execute(`
    CREATE TABLE IF NOT EXISTS tags (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      clip_id INTEGER NOT NULL REFERENCES clips(id) ON DELETE CASCADE,
      player TEXT NOT NULL,
      action TEXT NOT NULL,
      result TEXT NOT NULL CHECK(result IN ('Score','Miss','Foul','Turnover')),
      shot_type TEXT,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

// ─── Video Operations ───
export interface VideoRecord {
  id: number;
  file_path: string;
  file_name: string;
}

export async function addVideo(filePath: string, fileName: string): Promise<number> {
  if (isTauri()) {
    const database = await getTauriDb();
    const existing = await database.select<VideoRecord[]>(
      'SELECT id FROM videos WHERE file_path = ?', [filePath]
    );
    if (existing.length > 0) return existing[0].id;

    const result = await database.execute(
      'INSERT INTO videos (file_path, file_name) VALUES (?, ?)',
      [filePath, fileName]
    );
    return result.lastInsertId ?? 0;
  } else {
    // Web implementation
    const existing = await webQuery<VideoRecord[]>(
      'SELECT id FROM videos WHERE file_path = ?', [filePath]
    );
    if (existing && existing.length > 0) return existing[0].id;

    const result = await webExecute(
      'INSERT INTO videos (file_path, file_name) VALUES (?, ?)',
      [filePath, fileName]
    );
    return result.lastInsertId ?? 0;
  }
}

export async function getVideo(videoId: number): Promise<VideoRecord | null> {
  if (isTauri()) {
    const database = await getTauriDb();
    const rows = await database.select<VideoRecord[]>(
      'SELECT * FROM videos WHERE id = ?', [videoId]
    );
    return rows[0] || null;
  } else {
    const rows = await webQuery<VideoRecord[]>('SELECT * FROM videos WHERE id = ?', [videoId]);
    return rows[0] || null;
  }
}

// ─── Clip Operations ───
export interface ClipRecord {
  id: number;
  video_id: number;
  clip_type: 'Offense' | 'Defense';
  label: string | null;
  start_time: number;
  end_time: number;
  tags: TagRecord[];
}

export interface TagRecord {
  id: number;
  clip_id: number;
  player: string;
  action: string;
  result: string;
  shot_type: string | null;
}

export async function saveClip(
  videoId: number,
  clipType: 'Offense' | 'Defense',
  startTime: number,
  endTime: number
): Promise<number> {
  if (isTauri()) {
    const database = await getTauriDb();
    const result = await database.execute(
      'INSERT INTO clips (video_id, clip_type, start_time, end_time) VALUES (?, ?, ?, ?)',
      [videoId, clipType, startTime, endTime]
    );
    return result.lastInsertId ?? 0;
  } else {
    const result = await webExecute(
      'INSERT INTO clips (video_id, clip_type, start_time, end_time) VALUES (?, ?, ?, ?)',
      [videoId, clipType, startTime, endTime]
    );
    return result.lastInsertId ?? 0;
  }
}

export async function updateClipLabel(clipId: number, label: string): Promise<void> {
  if (isTauri()) {
    const database = await getTauriDb();
    await database.execute('UPDATE clips SET label = ? WHERE id = ?', [label, clipId]);
  } else {
    await webExecute('UPDATE clips SET label = ? WHERE id = ?', [label, clipId]);
  }
}

export async function getClips(videoId: number): Promise<ClipRecord[]> {
  if (isTauri()) {
    const database = await getTauriDb();
    const clips = await database.select<Omit<ClipRecord, 'tags'>[]>(
      'SELECT * FROM clips WHERE video_id = ? ORDER BY created_at DESC',
      [videoId]
    );

    const result: ClipRecord[] = [];
    for (const clip of clips) {
      const tags = await database.select<TagRecord[]>(
        'SELECT * FROM tags WHERE clip_id = ?', [clip.id]
      );
      result.push({ ...clip, tags });
    }
    return result;
  } else {
    const clips = await webQuery<Omit<ClipRecord, 'tags'>[]>(
      'SELECT * FROM clips WHERE video_id = ? ORDER BY created_at DESC',
      [videoId]
    );

    const result: ClipRecord[] = [];
    if (clips) {
      for (const clip of clips) {
        const tags = await webQuery<TagRecord[]>(
          'SELECT * FROM tags WHERE clip_id = ?', [clip.id]
        );
        result.push({ ...clip, tags: tags || [] });
      }
    }
    return result;
  }
}

export async function deleteClip(clipId: number): Promise<void> {
  if (isTauri()) {
    const database = await getTauriDb();
    await database.execute('DELETE FROM tags WHERE clip_id = ?', [clipId]);
    await database.execute('DELETE FROM clips WHERE id = ?', [clipId]);
  } else {
    await webExecute('DELETE FROM tags WHERE clip_id = ?', [clipId]);
    await webExecute('DELETE FROM clips WHERE id = ?', [clipId]);
  }
}

// ─── Tag Operations ───
export async function addTag(
  clipId: number,
  player: string,
  action: string,
  result: string,
  shotType?: string
): Promise<number> {
  if (isTauri()) {
    const database = await getTauriDb();
    const countResult = await database.select<{ cnt: number }[]>(
      'SELECT COUNT(*) as cnt FROM tags WHERE clip_id = ?', [clipId]
    );
    if (countResult[0].cnt >= 3) {
      throw new Error('Maximum of 3 tags per clip reached.');
    }

    const res = await database.execute(
      'INSERT INTO tags (clip_id, player, action, result, shot_type) VALUES (?, ?, ?, ?, ?)',
      [clipId, player, action, result, shotType || null]
    );
    return res.lastInsertId ?? 0;
  } else {
    const countResult = await webQuery<{ cnt: number }[]>(
      'SELECT COUNT(*) as cnt FROM tags WHERE clip_id = ?', [clipId]
    );
    if (countResult && countResult[0]?.cnt >= 3) {
      throw new Error('Maximum of 3 tags per clip reached.');
    }

    const res = await webExecute(
      'INSERT INTO tags (clip_id, player, action, result, shot_type) VALUES (?, ?, ?, ?, ?)',
      [clipId, player, action, result, shotType || null]
    );
    return res.lastInsertId ?? 0;
  }
}

export async function getTagCount(clipId: number): Promise<number> {
  if (isTauri()) {
    const database = await getTauriDb();
    const result = await database.select<{ cnt: number }[]>(
      'SELECT COUNT(*) as cnt FROM tags WHERE clip_id = ?', [clipId]
    );
    return result[0].cnt;
  } else {
    const result = await webQuery<{ cnt: number }[]>(
      'SELECT COUNT(*) as cnt FROM tags WHERE clip_id = ?', [clipId]
    );
    return result ? result[0].cnt : 0;
  }
}
export async function deleteVideo(videoId: number): Promise<void> {
  if (isTauri()) {
    const database = await getTauriDb();
    await database.execute('DELETE FROM videos WHERE id = ?', [videoId]);
  } else {
    await webExecute('DELETE FROM videos WHERE id = ?', [videoId]);
  }
}

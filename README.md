<div align="center">
  <h1>🏀 Courtvision</h1>
  <p><strong>The offline-first, zero-latency desktop application for elite basketball video analysis.</strong></p>
</div>

<br />

Courtvision is a premium, locally hosted desktop tool engineered specifically for basketball coaches and analysts. By combining the raw performance of a **Rust** backend with a modern **React** interface, Courtvision allows teams to seamlessly tag possessions, generate custom clips, and export drill-specific cutups without ever needing an internet connection.

## ✨ Key Features

- ⚡️ **Embedded FFmpeg Engine**: Export clips instantly with zero-compression loss. The video processing engine is native to the app—no external dependencies or terminal commands required.
- ⌨️ **Real-Time Hotkey Tracking**: Map `O` for Offense and `D` for Defense globally. The app autonomously cuts video and switches recording states without forcing you to pause the game film.
- 🗄️ **Local-First SQLite Database**: 100% offline persistence. All of your videos, clips, customizable tags, and situational notes live securely on your local hard drive.
- 🏷️ **Dynamic Tagging Workflow**: Built-in, fully customizable tagging structures. Easily categorize possessions by Player, Action (e.g., 2-Pointer, Post Up, Pick & Roll), and Result to build comprehensive scouting reports.
- 🚀 **Cross-Platform Deployment**: Automated CI/CD pipelines generate ready-to-run `.msi` (Windows) and `.dmg` (macOS) installers for plug-and-play distribution.

## 🛠️ Technology Stack

- **Frontend Environment:** React, TypeScript, Vite
- **UI Architecture:** Custom Glassmorphism, CSS Modules, Inter Variable Fonts
- **Backend Core:** Rust, Tauri v2
- **Database:** SQLite (`tauri-plugin-sql`)
- **Video Processing:** Pre-compiled Static FFmpeg Sidebars (`tauri-plugin-shell`)

## 📦 Installation & Setup

### For End Users (Coaches & Analysts)
1. Navigate to the **[Releases](https://github.com/ucEzette/Courtvision/releases)** tab on GitHub.
2. Download the latest installer for your operating system:
   - **Windows:** Download the `.msi` file.
   - **Mac:** Download the `.dmg` file.
3. Run the installer to enjoy a complete, out-of-the-box experience.

### For Developers
To build and run Courtvision locally from source:

#### Prerequisites
- [Node.js](https://nodejs.org/) (v20+)
- [Rust](https://www.rust-lang.org/tools/install)
- [FFmpeg Static Binaries](https://github.com/eugeneware/ffmpeg-static/releases) (placed in `src-tauri/binaries/`)

#### Build Instructions
```bash
# 1. Clone the repository
git clone https://github.com/ucEzette/Courtvision.git
cd Courtvision

# 2. Install frontend dependencies
npm install

# 3. Start the development server (auto-compiles UI & Rust backend)
npx tauri dev

# 4. Compile the final release installers (.dmg / .msi)
npx tauri build
```

## 🏗️ Architecture Notes

Courtvision uses Tauri's **Sidecar Architecture** to bypass traditional hardware requirements. Instead of requiring users to manually install FFmpeg on their machines via `brew` or environment variables, Courtvision downloads static, pre-compiled macOS (Apple Silicon / Intel) and Windows architecture binaries at build-time. These are embedded directly into the final installer, allowing the Rust backend to securely invoke video processing commands in a sandboxed shell completely invisible to the end user.

## 📄 License
MIT License. Free for open-source and personal use.

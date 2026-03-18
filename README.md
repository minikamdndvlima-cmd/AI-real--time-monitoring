<div align="center">
<img width="1200" height="475" alt="GHBanner" src="https://github.com/user-attachments/assets/0aa67016-6eaf-458a-adb2-6e31a0763ed6" />
</div>

# AI Real-Time Monitoring App

This contains everything you need to run your app locally and deploy it online.

## 🚀 Run Locally

**Prerequisites:** Node.js (v18+)

1. Install dependencies:
   ```bash
   npm install
   ```
2. Set the API Keys correctly:
   Create a `.env.local` or `.env` file and add your required keys (e.g., `GEMINI_API_KEY`, `GROK_API_KEY`, `KIMI_API_KEY`).
3. Run the app in development mode:
   ```bash
   npm run dev
   ```

## 🛠️ Scripts provided in `package.json`

- `npm run dev`: Starts the Vite + Express dev server using `tsx`.
- `npm run build`: Builds the Vite React frontend for production.
- `npm start`: Starts the application in production mode (requires `tsx` and `cross-env`).
- `npm run lint`: Runs TypeScript type-checking.
- `npm run clean`: Cleans the `dist` directory.

## 🌍 Deployment

A GitHub action has been configured inside `.github/workflows/deploy.yml` which triggers on pushes to the `main` branch. 

To deploy using this workflow:
1. Ensure your server can be accessed via SSH.
2. Add the following secrets to your GitHub Repository (**Settings** -> **Secrets and variables** -> **Actions**):
   - `SERVER_HOST`: Your server IP address
   - `SERVER_USER`: Your SSH username (e.g. `root`, `ubuntu`)
   - `SERVER_SSH_KEY`: Your private SSH key
3. Push to `main` to trigger the automatic deployment script.

## 🙈 `.gitignore`

The project includes an updated `.gitignore` configured to safely ignore:
- `node_modules/` and build outputs (`dist/`, `build/`).
- Private configuration files (`.env`, `.env.local` etc).
- IDE and editor specific folders (`.vscode/`, `.idea/`).
- Debug logs (e.g., `npm-debug.log`).

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVER_NAME = "Manba";

const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

const activeDeployments = {};

app.get('/', (req, res) => {
    res.json({
        server: SERVER_NAME,
        status: "Active",
        active_services: Object.keys(activeDeployments).length
    });
});

app.post('/deploy', (req, res) => {
    const { name, gitUrl, envVars } = req.body;

    if (!gitUrl) {
        return res.status(400).json({ error: "gitUrl talab qilinadi" });
    }

    const projectId = name ? `${name}-${uuidv4().substring(0, 5)}` : uuidv4();
    const projectPath = path.join(PROJECTS_DIR, projectId);

    const cloneCmd = `git clone ${gitUrl} ${projectPath}`;
    
    exec(cloneCmd, (cloneErr) => {
        if (cloneErr) {
            return res.status(500).json({ error: "Git clone xatosi", details: cloneErr.message });
        }

        if (envVars && typeof envVars === 'object') {
            const envContent = Object.entries(envVars)
                .map(([key, val]) => `${key}=${val}`)
                .join('\n');
            fs.writeFileSync(path.join(projectPath, '.env'), envContent);
        }

        let startCmd = '';
        if (fs.existsSync(path.join(projectPath, 'package.json'))) {
            startCmd = `cd ${projectPath} && npm install && npm start`;
        } else if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) {
            startCmd = `cd ${projectPath} && pip install -r requirements.txt && python3 main.py`;
        } else {
            return res.status(400).json({ error: "Noma'lum proyekt turi." });
        }

        const process = exec(startCmd, { cwd: projectPath });

        activeDeployments[projectId] = {
            pid: process.pid,
            status: "running",
            startedAt: new Date(),
            gitUrl
        };

        return res.status(200).json({
            message: "Loyiha deploy qilindi!",
            server: SERVER_NAME,
            projectId: projectId
        });
    });
});

app.get('/deployments', (req, res) => {
    res.json({
        server: SERVER_NAME,
        deployments: activeDeployments
    });
});

app.listen(PORT, () => {
    console.log(`🚀 ${SERVER_NAME} serveri ${PORT}-portda ishga tushdi.`);
});

const express = require('express');
const { exec } = require('child_process');
const fs = require('fs');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const SERVER_NAME = "Manba";

// Saqlash papkalari
const PROJECTS_DIR = path.join(__dirname, 'projects');
if (!fs.existsSync(PROJECTS_DIR)) {
    fs.mkdirSync(PROJECTS_DIR, { recursive: true });
}

// Ishlayotgan deploy jarayonlari xotirasi
const activeDeployments = {};

// 1. Server holatini tekshirish
app.get('/', (req, res) => {
    res.json({
        server: SERVER_NAME,
        status: "Active",
        active_services: Object.keys(activeDeployments).length
    });
});

// 2. Loyiha kodini yuklash va Deploy qilish (Render standarti)
app.post('/deploy', (req, res) => {
    const { name, gitUrl, envVars } = req.body;

    if (!gitUrl) {
        return res.status(400).json({ error: "gitUrl talab qilinadi" });
    }

    const projectId = name ? `${name}-${uuidv4().substring(0, 5)}` : uuidv4();
    const projectPath = path.join(PROJECTS_DIR, projectId);

    console.log(`[${SERVER_NAME}] Deploy boshlandi: ${projectId}`);

    // Git repository klonlash
    const cloneCmd = `git clone ${gitUrl} ${projectPath}`;
    
    exec(cloneCmd, (cloneErr) => {
        if (cloneErr) {
            console.error(`[${SERVER_NAME}] Clone xatosi:`, cloneErr);
            return res.status(500).json({ error: "Git repository yuklab o'da xatolik bo'ldi", details: cloneErr.message });
        }

        // Environment o'zgaruvchilarini (.env) yozish
        if (envVars && typeof envVars === 'object') {
            const envContent = Object.entries(envVars)
                .map(([key, val]) => `${key}=${val}`)
                .join('\n');
            fs.writeFileSync(path.join(projectPath, '.env'), envContent);
        }

        // Avtomatik Node.js yoki Python loyihani aniqlash va ishga tushirish
        let startCmd = '';
        if (fs.existsSync(path.join(projectPath, 'package.json'))) {
            startCmd = `cd ${projectPath} && npm install && npm start`;
        } else if (fs.existsSync(path.join(projectPath, 'requirements.txt'))) {
            startCmd = `cd ${projectPath} && pip install -r requirements.txt && python3 main.py`;
        } else {
            return res.status(400).json({ error: "Noma'lum loyiha turi. package.json yoki requirements.txt topilmadi." });
        }

        // Fondagi process sifatida ishga tushirish (Background Process)
        const process = exec(startCmd, { cwd: projectPath });

        activeDeployments[projectId] = {
            pid: process.pid,
            status: "running",
            startedAt: new Date(),
            gitUrl
        };

        process.stdout.on('data', (data) => {
            console.log(`[${projectId} Logs]: ${data}`);
        });

        process.stderr.on('data', (data) => {
            console.error(`[${projectId} Error]: ${data}`);
        });

        process.on('close', (code) => {
            console.log(`[${projectId}] Jarayon yakunlandi. Code: ${code}`);
            if (activeDeployments[projectId]) {
                activeDeployments[projectId].status = `stopped (code ${code})`;
            }
        });

        return res.status(200).json({
            message: "Loyiha muvaffaqiyatli deploy qilindi!",
            server: SERVER_NAME,
            projectId: projectId,
            pid: process.pid
        });
    });
});

// 3. Faol deploylarni ko'rish
app.get('/deployments', (req, res) => {
    res.json({
        server: SERVER_NAME,
        deployments: activeDeployments
    });
});

// 4. Deploy qilingan loyihani to'xtatish
app.post('/stop/:id', (req, res) => {
    const { id } = req.params;
    const deployment = activeDeployments[id];

    if (!deployment || !deployment.pid) {
        return res.status(404).json({ error: "Loyiha topilmadi yoki faol emas" });
    }

    try {
        process.kill(deployment.pid);
        deployment.status = "stopped";
        res.json({ message: `Loyiha ${id} to'xtatildi.` });
    } catch (err) {
        res.status(500).json({ error: "To'xtatishda xatolik", details: err.message });
    }
});

app.listen(PORT, () => {
    console.log(`🚀 ${SERVER_NAME} serveri ${PORT}-portda ishga tushdi.`);
});

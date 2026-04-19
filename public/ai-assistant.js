/**
 * 🤖 Civil Engineering AI Assistant (Powered by OpenClaw Logic)
 * ─────────────────────────────────────────────────────────────
 * Features:
 *  - Context-aware chat with project data
 *  - Autonomous task execution (Tool Calling)
 *  - Civil engineering calculations (IS Code helper)
 *  - Voice interface & Natural Language Processing
 */

(function() {
    'use strict';

    // ── STATE ──
    const AI_STATE = {
        isOpen: false,
        isTyping: false,
        history: [],
        tools: {},
        recognition: null,
        mediaRecorder: null,
        audioChunks: [],
        isListening: false,
        isSpeaking: false,
        knowledgeBase: [],
        config: { 
            groqKey: '',
            models: {
                llm: 'llama-3.3-70b-versatile',
                stt: 'whisper-large-v3-turbo',
                tts: 'canopylabs/orpheus-v1-english'
            }
        }
    };

    // ── DOM ELEMENTS ──
    let fab, container, messagesArea, inputField, sendBtn, micBtn;

    // ── INITIALIZATION ──
    function initAI() {
        createUI();
        registerTools();
        setupSpeech();
        
        // Initial greeting
        setTimeout(() => {
            addMessage('bot', "Hello! I'm Jarvis, your civil engineering assistant. How can I help you today? You can ask me to calculate mixes, search workers, or check project status.");
        }, 1000);
    }

    function createUI() {
        // Create Floating Button
        fab = document.createElement('div');
        fab.className = 'ai-fab';
        fab.innerHTML = '🤖';
        fab.title = 'Talk to AI Assistant';
        document.body.appendChild(fab);

        // Create Chat Container
        container = document.createElement('div');
        container.className = 'ai-chat-container';
        container.innerHTML = `
            <div class="ai-chat-header">
                <div class="ai-avatar">🎙️</div>
                <div class="ai-header-info">
                    <h4>Jarvis</h4>
                    <div class="ai-status-indicator">
                        <span class="ai-dot" id="aiStatusDot"></span>
                        <span id="aiStatusText">Engine Active</span>
                        <div class="ai-speaking-wave" id="aiSpeakingWave">
                            <div class="ai-wave-bar"></div>
                            <div class="ai-wave-bar"></div>
                            <div class="ai-wave-bar"></div>
                        </div>
                    </div>
                </div>
                <button class="ai-settings-btn" id="aiSettingsBtn" title="LLM Settings">⚙️</button>
            </div>
            <div class="ai-config-panel" id="aiConfigPanel">
                <label>Groq API Key (Whisper & Orpheus)</label>
                <input type="password" id="openRouterKeyInput" placeholder="gsk_...">
                <button class="btn-primary" id="saveAiConfigBtn" style="width:100%; padding: 0.4rem; font-size:0.8rem; margin-top:0.4rem">Save Key</button>
            </div>
            <div class="ai-messages" id="aiMessages"></div>
            <div class="ai-quick-actions">
                <button class="ai-action-btn" data-query="Calculate M20 Mix">🧊 M20 Mix</button>
                <button class="ai-action-btn" data-query="Who are the painters?">🎨 List Painters</button>
                <button class="ai-action-btn" data-query="Site budget status?">💰 Budget Status</button>
            </div>
            <div class="ai-files-container" id="aiFilesContainer"></div>
            <div class="ai-chat-input">
                <input type="file" id="aiFileInput" style="display:none;" accept=".txt,.pdf,.is,.doc,.docx" multiple>
                <button class="ai-file-btn" id="aiFileBtn" title="Upload IS Codes/Notes">📎</button>
                <button class="ai-mic-btn" id="aiMicBtn" title="Voice Input">🎤</button>
                <textarea class="ai-input" id="aiInput" placeholder="Ask me anything..." rows="1"></textarea>
                <button class="ai-send-btn" id="aiSendBtn">🚀</button>
            </div>
        `;
        document.body.appendChild(container);

        messagesArea = document.getElementById('aiMessages');
        inputField = document.getElementById('aiInput');
        sendBtn = document.getElementById('aiSendBtn');
        micBtn = document.getElementById('aiMicBtn');
        const settingsBtn = document.getElementById('aiSettingsBtn');
        const saveConfigBtn = document.getElementById('saveAiConfigBtn');
        const fileBtn = document.getElementById('aiFileBtn');
        const fileInput = document.getElementById('aiFileInput');
        const filesContainer = document.getElementById('aiFilesContainer');

        // Load config
        const savedKey = localStorage.getItem('sitebuild_groq_key');
        if (savedKey) {
            AI_STATE.config.groqKey = savedKey;
            document.getElementById('openRouterKeyInput').value = savedKey;
        }

        // Event Listeners
        fab.addEventListener('click', toggleChat);
        sendBtn.addEventListener('click', handleSend);
        
        settingsBtn.addEventListener('click', () => {
            container.classList.toggle('show-config');
        });
        
        saveConfigBtn.addEventListener('click', () => {
            const key = document.getElementById('openRouterKeyInput').value.trim();
            AI_STATE.config.groqKey = key;
            localStorage.setItem('sitebuild_groq_key', key);
            container.classList.remove('show-config');
            addMessage('bot', "✅ Jarvis Engine API key saved. Core systems online!");
        });
        
        fileBtn.addEventListener('click', () => fileInput.click());
        fileInput.addEventListener('change', handleFileUpload);

        inputField.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        });

        // Quick Actions
        container.querySelectorAll('.ai-action-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                inputField.value = btn.dataset.query;
                handleSend();
            });
        });

        // Auto-resize input
        inputField.addEventListener('input', () => {
            inputField.style.height = 'auto';
            inputField.style.height = (inputField.scrollHeight) + 'px';
        });
    }

    function handleFileUpload(e) {
        const files = e.target.files;
        if (!files.length) return;
        
        const filesContainer = document.getElementById('aiFilesContainer');
        
        Array.from(files).forEach(file => {
            const reader = new FileReader();
            reader.onload = (ev) => {
                const text = ev.target.result;
                const kbEntry = { name: file.name, content: text };
                AI_STATE.knowledgeBase.push(kbEntry);
                
                const badge = document.createElement('div');
                badge.className = 'ai-file-badge';
                badge.innerHTML = `📄 ${file.name} <span class="ai-remove-file" data-name="${file.name}">×</span>`;
                filesContainer.appendChild(badge);
                
                badge.querySelector('.ai-remove-file').addEventListener('click', function() {
                    const nameToRemove = this.getAttribute('data-name');
                    AI_STATE.knowledgeBase = AI_STATE.knowledgeBase.filter(f => f.name !== nameToRemove);
                    badge.remove();
                });
                
                addMessage('bot', `📚 Uploaded "${file.name}" to my knowledge base. I can now extract answers exactly from there!`);
            };
            
            if (file.name.endsWith('.txt') || file.name.endsWith('.is') || file.name.endsWith('.csv')) {
                 reader.readAsText(file);
            } else {
                 // Mocking PDF/Word text extraction (agentic placeholder for binary formats)
                 setTimeout(() => {
                     const mockText = `EXTRACTED CONTENT FROM ${file.name}:\nThis document contains structural notes, concrete IS codes, and labour estimations for your SaaS platform. According to IS 456, maximum w/c ratio is often 0.45 for severe exposure.`;
                     const kbEntry = { name: file.name, content: mockText };
                     AI_STATE.knowledgeBase.push(kbEntry);
                     
                     const badge = document.createElement('div');
                     badge.className = 'ai-file-badge';
                     badge.innerHTML = `📄 ${file.name} <span class="ai-remove-file" data-name="${file.name}">×</span>`;
                     filesContainer.appendChild(badge);
                     badge.querySelector('.ai-remove-file').addEventListener('click', function() {
                        const nameToRemove = this.getAttribute('data-name');
                        AI_STATE.knowledgeBase = AI_STATE.knowledgeBase.filter(f => f.name !== nameToRemove);
                        badge.remove();
                     });
                     addMessage('bot', `📚 Uploaded "${file.name}" to my knowledge memory.`);
                 }, 600);
            }
        });
        e.target.value = '';
    }

    function toggleChat() {
        AI_STATE.isOpen = !AI_STATE.isOpen;
        container.classList.toggle('open', AI_STATE.isOpen);
        fab.classList.toggle('active', AI_STATE.isOpen);
        if (AI_STATE.isOpen) inputField.focus();
    }

    // ── SPEECH RECOGNITION ──
    function setupSpeech() {
        const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
        
        // Even if browser STT is available, we'll use Groq Whisper for better accuracy
        micBtn.addEventListener('click', async () => {
            if (AI_STATE.isListening) {
                stopRecording();
            } else {
                startRecording();
            }
        });
    }

    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            AI_STATE.mediaRecorder = new MediaRecorder(stream);
            AI_STATE.audioChunks = [];

            AI_STATE.mediaRecorder.ondataavailable = (event) => {
                AI_STATE.audioChunks.push(event.data);
            };

            AI_STATE.mediaRecorder.onstop = async () => {
                const audioBlob = new Blob(AI_STATE.audioChunks, { type: 'audio/webm' });
                await handleVoiceTranscription(audioBlob);
            };

            AI_STATE.mediaRecorder.start();
            AI_STATE.isListening = true;
            micBtn.classList.add('active');
            inputField.placeholder = "Listening... (Talk now)";
        } catch (err) {
            console.error("Error accessing microphone:", err);
            addMessage('bot', "❌ Error: Could not access microphone. Please check permissions.");
        }
    }

    function stopRecording() {
        if (AI_STATE.mediaRecorder && AI_STATE.isListening) {
            AI_STATE.mediaRecorder.stop();
            AI_STATE.isListening = false;
            micBtn.classList.remove('active');
            inputField.placeholder = "Processing voice...";
        }
    }

    async function handleVoiceTranscription(audioBlob) {
        if (!AI_STATE.config.groqKey) {
            addMessage('bot', "❌ Groq API key is missing. Please add it in settings.");
            return;
        }

        showTyping();
        const formData = new FormData();
        formData.append('file', audioBlob, 'audio.webm');
        formData.append('model', AI_STATE.config.models.stt);
        formData.append('response_format', 'json');

        try {
            const response = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AI_STATE.config.groqKey}`
                },
                body: formData
            });

            const data = await response.json();
            hideTyping();
            
            if (data.text) {
                inputField.value = data.text;
                handleSend();
            } else {
                console.error("Transcription error:", data);
            }
        } catch (err) {
            console.error("Transcription API error:", err);
            hideTyping();
        }
    }

    async function speakText(text) {
        if (!AI_STATE.config.groqKey) return;
        
        // Update UI to suggest speaking state
        const statusDot = document.getElementById('aiStatusDot');
        const statusText = document.getElementById('aiStatusText');
        const wave = document.getElementById('aiSpeakingWave');
        
        if (statusDot) statusDot.classList.add('speaking');
        if (statusText) statusText.textContent = 'Speaking...';
        if (wave) wave.classList.add('active');
        AI_STATE.isSpeaking = true;

        try {
            const response = await fetch('https://api.groq.com/openai/v1/audio/speech', {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${AI_STATE.config.groqKey}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    model: AI_STATE.config.models.tts,
                    input: text,
                    voice: 'orpheus' // Specific to the Orpheus model
                })
            });

            if (!response.ok) throw new Error('Speech synthesis failed');

            const audioBlob = await response.blob();
            const audioUrl = URL.createObjectURL(audioBlob);
            const audio = new Audio(audioUrl);
            
            audio.onended = () => {
                if (statusDot) statusDot.classList.remove('speaking');
                if (statusText) statusText.textContent = 'Engine Active';
                if (wave) wave.classList.remove('active');
                AI_STATE.isSpeaking = false;
                URL.revokeObjectURL(audioUrl);
            };

            await audio.play();
        } catch (err) {
            console.error("Speech error:", err);
            // Fallback to browser TTS if Groq fails
            const utterance = new SpeechSynthesisUtterance(text);
            utterance.onend = () => {
                if (statusDot) statusDot.classList.remove('speaking');
                if (statusText) statusText.textContent = 'Engine Active';
                if (wave) wave.classList.remove('active');
                AI_STATE.isSpeaking = false;
            };
            window.speechSynthesis.speak(utterance);
        }
    }

    // ── COMMUNICATION ──
    function addMessage(role, text) {
        const msgDiv = document.createElement('div');
        msgDiv.className = `ai-message ${role}`;
        msgDiv.textContent = text;
        messagesArea.appendChild(msgDiv);
        messagesArea.scrollTop = messagesArea.scrollHeight;
        
        AI_STATE.history.push({ role, text });
        if (AI_STATE.history.length > 20) AI_STATE.history.shift();
    }

    function showTyping() {
        if (AI_STATE.isTyping) return;
        AI_STATE.isTyping = true;
        const typingDiv = document.createElement('div');
        typingDiv.className = 'ai-typing';
        typingDiv.id = 'aiTyping';
        typingDiv.textContent = 'Jarvis is thinking...';
        messagesArea.appendChild(typingDiv);
        messagesArea.scrollTop = messagesArea.scrollHeight;
    }

    function hideTyping() {
        const typingDiv = document.getElementById('aiTyping');
        if (typingDiv) typingDiv.remove();
        AI_STATE.isTyping = false;
    }

    async function handleSend() {
        const text = inputField.value.trim();
        if (!text) return;

        addMessage('user', text);
        inputField.value = '';
        inputField.style.height = 'auto';

        showTyping();

        setTimeout(async () => {
            let response = null;
            if (AI_STATE.config.groqKey) {
                response = await callLLM(text);
            }
            if (!response) {
                // FALLBACK
                response = await processNaturalLanguage(text);
            }
            hideTyping();
            addMessage('bot', response);
            
            // JARVIS SPEAKS
            speakText(response);
        }, 500);
    }

    async function callLLM(query) {
        if (!AI_STATE.config.groqKey) return null;
        
        let kbContext = "";
        if (AI_STATE.knowledgeBase.length > 0) {
            kbContext = "\n\nKNOWLEDGE BASE DOCUMENTS (Use exactly if asked):\n";
            AI_STATE.knowledgeBase.forEach(kb => {
                kbContext += `--- Document: ${kb.name} ---\n${kb.content.substring(0, 1500)}\n\n`;
            });
        }
        
        const activeSiteId = window.state?.activeSiteId;
        const activeSite = window.state?.sites.find(s => s.id === activeSiteId)?.name || "Current Project";
        
        const systemPrompt = `You are "Jarvis", an elite Civil Engineering Assistant designed for SiteBuild ERP.
        
# PERSONALITY
- You are professional, precise, and highly competent.
- You speak clearly and emphasize technical accuracy in units (kN, MPa, SQFT).
- You are always ready to help with calculations or project management.

# VOICE STACK
- Input: Groq Whisper (whisper-large-v3-turbo)
- Output: Groq Orpheus (canopylabs/orpheus-v1-english)

# TOOLS & CAPABILITIES
- Structure Calculations (Mix design, Steel weight, etc.)
- Site Status (Budget, Worker attendance)
- Navigation (Dashboard, Workers, Mix, Estimate)

Current Site Active: ${activeSite}.
If user commands navigation, reply with a TOOL CALL in JSON exact format: {"tool":"navigate", "tab":"dashboard", "message":"Going to dashboard."}
Options: dashboard, workers, attendance, payments, analytics, mix-design, estimate-calculator.${kbContext}`;

        const messages = [
            { role: "system", content: systemPrompt },
            ...AI_STATE.history.map(msg => ({ role: (msg.role === 'bot' ? 'assistant' : 'user'), content: msg.text }))
        ];

        try {
            const resp = await fetch('https://api.groq.com/openai/v1/chat/completions', {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_STATE.config.groqKey}`
                },
                body: JSON.stringify({
                    model: AI_STATE.config.models.llm,
                    messages: messages,
                    temperature: 0.7
                })
            });
            
            if (!resp.ok) {
                try {
                    const errorData = await resp.json();
                    console.error("OpenRouter Error:", errorData);
                } catch(e) {
                    console.error("OpenRouter Error (no JSON):", resp.status);
                }
                return null; // Trigger fallback
            }

            const data = await resp.json();
            if (data.error) {
                console.error("OpenRouter API Error:", data.error);
                return null;
            }
            
            let result = data.choices[0].message.content;
            
            // Check structured tool call
            if (result.includes('{"tool"')) {
                try {
                     const startMsg = result.indexOf('{');
                     const endMsg = result.lastIndexOf('}');
                     if (startMsg !== -1 && endMsg !== -1) {
                         const jsonStr = result.substring(startMsg, endMsg + 1);
                         const toolCall = JSON.parse(jsonStr);
                         if (toolCall.tool === 'navigate') {
                             AI_STATE.tools.navigateTo(toolCall.tab);
                             return toolCall.message || "Navigating module right away.";
                         }
                     }
                } catch(e){}
            }
            return result;
        } catch (e) {
            console.error(e);
            return null; // trigger fallback
        }
    }

    // ── AGENTIC LOGIC (Simplified OpenClaw) ──
    async function processNaturalLanguage(query) {
        const q = query.toLowerCase();
        
        // Context Awareness: Get current site name if possible
        const activeSiteId = window.state?.activeSiteId;
        const activeSite = window.state?.sites.find(s => s.id === activeSiteId)?.name || "Current Project";

        // Knowledge Base Document Checking
        if (AI_STATE.knowledgeBase.length > 0) {
            const words = q.split(' ').filter(w => w.length > 4);
            for (let kb of AI_STATE.knowledgeBase) {
                if (words.some(word => kb.content.toLowerCase().includes(word))) {
                    return `Based on "${kb.name}" in my knowledge base:\n${kb.content.substring(0, 200)}...`;
                }
            }
        }

        // 1. TOOL: MIX DESIGN
        if (q.includes('mix') || q.includes('concrete') || q.includes('m20') || q.includes('m25') || q.includes('m30')) {
            const grade = q.match(/m\d{2}/i)?.[0] || 'M20';
            const volume = parseFloat(q.match(/(\d+(\.\d+)?)\s*(m3|cubic|m\^3)/)?.[1]) || 1;
            
            // Call tool
            return AI_STATE.tools.calculateMix(grade, volume);
        }

        // 2. TOOL: WORKER SEARCH
        if (q.includes('worker') || q.includes('who') || q.includes('mason') || q.includes('painter') || q.includes('helper')) {
            const category = q.match(/(mason|painter|helper|electrician|plumber|welder|bar bender)/i)?.[0];
            return AI_STATE.tools.searchWorkers(category);
        }

        // 3. TOOL: BUDGET & COST
        if (q.includes('budget') || q.includes('cost') || q.includes('money') || q.includes('spend')) {
            return AI_STATE.tools.checkBudget(activeSite);
        }

        // 4. TOOL: NAVIGATION
        if (q.includes('go to') || q.includes('show tab') || q.includes('open')) {
            const tab = q.match(/(dashboard|workers|attendance|payments|analytics|mix|estimate)/i)?.[0];
            if (tab) {
                AI_STATE.tools.navigateTo(tab);
                return `Done! I've opened the ${tab.toUpperCase()} module for you. Anything else?`;
            }
        }

        // 5. CIVIL ENGINEERING GENERAL KNOWLEDGE (Simulated)
        if (q.includes('water cement') || q.includes('ratio')) {
            return "According to IS 456:2000, for 'Moderate' exposure, the maximum free water-cement ratio is 0.50 for Reinforced Concrete (RCC) and 0.60 for Plain Concrete (PCC). Would you like to set this in the Mix Design tool?";
        }
        
        if (q.includes('steel') || q.includes('reinforcement')) {
            return "The weight of steel can be calculated using D²/162 kg/m. For example, a 12mm bar weighs roughly 0.888 kg per meter. I can help you calculate total steel requirement if you provide the length and diameter!";
        }

        // Default: Fallback to general assistance
        return "I understand your query about \"" + query + "\". As a Civil Engineering assistant, I can help you manage " + activeSite + ". Should I generate a site report, check today's attendance, or perform a material estimation for you?";
    }

    // ── TOOL REGISTRATION ──
    function registerTools() {
        AI_STATE.tools.calculateMix = (grade, volume = 1) => {
            // Logic based on standard ratios
            const ratios = {
                'M10': { c: 1, s: 3, a: 6 },
                'M15': { c: 1, s: 2, a: 4 },
                'M20': { c: 1, s: 1.5, a: 3 },
                'M25': { c: 1, s: 1, a: 2 }
            };
            const r = ratios[grade.toUpperCase()] || ratios['M20'];
            const totalParts = r.c + r.s + r.a;
            const dryVol = volume * 1.54; // 54% increase for dry volume
            
            const cementVol = (r.c / totalParts) * dryVol;
            const bags = Math.ceil(cementVol / 0.035); // 1 bag = 0.035 m3
            
            return `For ${volume}m³ of ${grade.toUpperCase()} concrete: You will need ${bags} bags of cement, ${(r.s/totalParts * dryVol).toFixed(2)}m³ of Sand, and ${(r.a/totalParts * dryVol).toFixed(2)}m³ of Aggregate. I can also generate a detailed PDF report for this in the Mix Design tab!`;
        };

        AI_STATE.tools.searchWorkers = (category) => {
            if (!window.state?.workers) return "I can't see the worker list right now. Please make sure the app is connected to the database.";
            
            let list = window.state.workers.filter(w => w.is_active);
            if (category) {
                list = list.filter(w => w.category.toLowerCase() === category.toLowerCase());
            }

            if (list.length === 0) return `I couldn't find any active ${category || 'workers'} on this site.`;

            const names = list.slice(0, 5).map(w => w.name).join(', ');
            return `I found ${list.length} ${category || 'active workers'} on this site: ${names}${list.length > 5 ? ' and others.' : '.'} Would you like to see their attendance history?`;
        };

        AI_STATE.tools.checkBudget = (siteName) => {
            const dailyBurn = document.getElementById('globalDailyBurn')?.textContent || "₹0";
            const projected = document.getElementById('healthProjectedCost')?.textContent?.replace('Projected Total: ', '') || "₹0";
            return `For site "${siteName}", the current daily liability (burn rate) is ${dailyBurn}. Total projected labour cost till deadline is ${projected}. You are currently ${document.getElementById('healthLabel')?.textContent?.includes('On Track') ? 'on track!' : 'at risk (check Site Health Widget)'}.`;
        };

        AI_STATE.tools.navigateTo = (tabName) => {
            let target = tabName.toLowerCase();
            if (target === 'mix') target = 'mix-design';
            if (target === 'estimate') target = 'estimate-calculator';
            
            const btn = document.querySelector(`.tab-btn[data-tab="${target}"]`);
            if (btn) btn.click();
        };
    }

    // Launch AI
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initAI);
    } else {
        initAI();
    }
})();

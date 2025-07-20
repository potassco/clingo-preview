
const Clingo = (() => {
    // TODO: DOM management should be separated from the logic
    const SessionManager = (() => {
        const inputElement = ace.edit("input")
        const tabList = document.getElementById("tabs");
        const sessions = []
        let active = null

        const stringify = () => {
            const data = sessions.map(s => ({
                type: s.type,
                name: s.name,
                content: s.session.getValue()
            }));
            return JSON.stringify(data)
        }

        const create = (type, name, content = null) => {
            let typeIcon = "";
            if (type === "python") { typeIcon = "🐍"; }
            else if (type === "clingo") { typeIcon = "🦉"; }
            else {
                return;
            }

            const tabEl = document.createElement("li");
            tabEl.className = "tab-item";
            tabEl.innerHTML = `
                    <span class="tab-icon">${typeIcon}</span>
                    <span class="tab-name">${name}</span>
                    <button class="tab-close" title="Close">&#10005;</button>
                `;

            const session = ace.createEditSession("");
            session.$blockScrolling = Infinity
            session.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                mode: `ace/mode/${type}`,
            })
            inputElement.setSession(session)
            if (content !== null) {
                inputElement.setValue(content, 1);
            }

            const sessionEntry = { type, session, name, tabEl }
            sessions.push(sessionEntry)
            setActive(sessionEntry)

            tabEl.onclick = () => setActive(sessionEntry)
            tabEl.ondblclick = () => edit(sessionEntry);
            tabEl.querySelector('.tab-close').onclick = (e) => {
                e.stopPropagation();
                close(sessionEntry)
            };
            tabList.appendChild(tabEl);
            tabEl.onclick();
        }

        const edit = (session) => {
            const nameSpan = session.tabEl.querySelector('.tab-name');
            const currentName = nameSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.width = '80%';
            nameSpan.textContent = '';
            nameSpan.appendChild(input);
            input.focus();

            input.onblur = function () {
                session.name = input.value;
                nameSpan.textContent = input.value;
                session.tabEl.ondblclick = function () { edit(session); };
                inputElement.focus();
            };
            input.onkeydown = function (e) {
                if (e.key === 'Enter') { input.blur(); }
                if (e.key === 'Escape') {
                    nameSpan.textContent = currentName;
                    session.tabEl.ondblclick = function () { edit(session); };
                    inputElement.focus();
                }
            };
            session.tabEl.ondblclick = null;
        }

        const close = (session) => {
            const index = sessions.findIndex(s => s.session === session);
            if (index !== -1) {
                sessions.splice(index, 1);
            }
            session.destroy();
            if (sessions.length === 0) {
                active = null;
                create("clingo", "Untitled", "");
            }
            else if (session.tabEl.classList.contains("active")) {
                inputElement.setSession(sessions[0].session);
                sessions[0].tabEl.classList.add("active");
                active = sessions[0]
                inputElement.focus();
            }
            tabEl.remove();
        }

        const clear = () => {
            sessions.forEach(session => {
                session.tabEl.remove();
                session.session.destroy();
            });
            sessions.length = 0;
        }

        const setActive = (session) => {
            if (active !== null) {
                active.tabEl.classList.remove("active");
            }
            active = session;
            session.tabEl.classList.add("active");
            inputElement.setSession(session.session)
            inputElement.focus();
        }

        const getContent = () => {
            let result = [];
            let first = true;
            for (const s of sessions) {
                if (s.type === "python") {
                    result.push(`#script(python)\n${s.session.getValue()}\n#end.`)
                } else {
                    if (!first) {
                        result.push("#program base.")
                    }
                    else {
                        first = false;
                    }
                    result.push(s.session.getValue())
                }
            }
            return result.join('\n');
        }

        const setInput = (value, name) => {
            // Split value by tab markers
            const tabRegex = /^%%% Tab: (.+)$/gm;
            let match, lastIndex = 0, tabs = [];
            while ((match = tabRegex.exec(value)) !== null) {
                if (match.index > lastIndex) {
                    if (tabs.length > 0) {
                        tabs[tabs.length - 1].content = value.slice(lastIndex, match.index)
                    } else {
                        tabs.push({ name, content: value.slice(lastIndex, match.index) });
                    }
                }
                tabs.push({
                    name: match[1].trim(),
                    content: ""
                });
                lastIndex = tabRegex.lastIndex;
            }
            if (tabs.length > 0) {
                tabs[tabs.length - 1].content = value.slice(lastIndex);
            } else {
                tabs = [{ name, content: value }];
            }
            clear()
            tabs.forEach(tab => {
                let lines = tab.content.trim().split('\n');
                let type = "clingo";
                if (lines.length >= 2 && lines[0].startsWith("#script(python)") && lines[lines.length - 1].startsWith("#end.")) {
                    type = "python";
                    lines.shift();
                    lines.pop();
                }
                create(type, tab.name, lines.join('\n'));
            });
        }

        const init = () => {
            inputElement.setTheme("ace/theme/textmate")
            inputElement.$blockScrolling = Infinity
            inputElement.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                maxLines: Infinity,
                autoScrollEditorIntoView: true
            })
            setInput(inputElement.getValue(), "harry-and-sally.lp")
        }

        init()

        return { clear, stringify, create, getContent }
    })()

    // TODO: DOM management should be separated from the logic
    const WorkspaceManager = (() => {
        const workspaceList = document.getElementById("workspace-list");
        const workspaceSaveBtn = document.getElementById("workspace-save");
        const workspaceSaveAsBtn = document.getElementById("workspace-saveas");
        const workspaceLoadBtn = document.getElementById("workspace-load");
        const workspaceDeleteBtn = document.getElementById("workspace-delete");
        const workspaceDownloadBtn = document.getElementById("workspace-download");
        let active = null;

        const list = () => Object.keys(localStorage).filter(k => k.startsWith("workspace:")).map(k => k.replace("workspace:", ""))

        const save = (name = null) => {
            console.log("Saving workspace", name)
            if (name !== null) {
                active = name;
            }
            console.log("Saving workspace", active)
            if (active !== null) {
                console.log("really Saving workspace", active)
                localStorage.setItem("workspace:" + active, SessionManager.stringify())
            }
        }

        const load = () => {
            if (active !== null) {
                const data = JSON.parse(localStorage.getItem("workspace:" + active) || "[]");
                SessionManager.clear();
                data.forEach(file => {
                    SessionManager.create(file.type, file.name, file.content);
                });
            }
        }

        const remove = () => {
            if (active !== null) {
                localStorage.removeItem("workspace:" + active);
                active = null;
            }
        }

        const select = (name) => {
            active = name
            update()
        }

        const update = () => {
            document
                .querySelectorAll('.workspace-list-item')
                .forEach(el => {
                    el.classList.toggle('selected', el.getAttribute('aria-name') === active);
                })
            workspaceLoadBtn.disabled = active === null;;
            workspaceDeleteBtn.disabled = active === null;
            workspaceSaveBtn.disabled = active === null;
        }

        const updateDropdown = () => {
            workspaceList.innerHTML = "";
            list().forEach(name => {
                const item = document.createElement("div");
                item.textContent = name;
                item.className = "workspace-list-item";
                item.style.cursor = "pointer";
                item.setAttribute("aria-name", name)
                item.onclick = () => {
                    select(name);
                };
                workspaceList.appendChild(item);
            });
            update();
        }

        function splitExt(filename) {
            const idx = filename.lastIndexOf(".");
            if (idx <= 0) {
                return [filename, ""]
            }
            return [filename.slice(0, idx), filename.slice(idx)];
        }

        const sanitizeFileName = (name, existing) => {
            let base = name.replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 100);
            let [namePart, extPart] = splitExt(base);
            let unique = base;
            let counter = 1;
            while (existing[unique]) {
                unique = `${namePart}_${counter}${extPart}`;
                counter++;
            }
            existing[unique] = true;
            return unique;
        }

        const loadZipLib = async () => {
            if (!window.JSZip) {
                await new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
                    script.onload = resolve;
                    document.head.appendChild(script);
                });
            }
        };

        const downloadWorkspace = async () => {
            await loadZipLib();
            const workspaceNames = list();
            if (workspaceNames.length === 0) {
                return;
            }
            const zip = new window.JSZip();
            const existingWS = {};
            for (const wsName of workspaceNames) {
                const data = JSON.parse(localStorage.getItem("workspace:" + wsName) || "[]");
                const folder = zip.folder(sanitizeFileName(wsName, existingWS));
                const existingLP = {};
                const existingPY = {};
                data.forEach(file => {
                    let existing = file.type === "python" ? existingPY : existingLP;
                    folder.file(sanitizeFileName(file.name, existing), file.content);
                });
            }
            const blob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `workspaces.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        const init = () => {
            updateDropdown()
            workspaceSaveBtn.onclick = () => save()
            workspaceSaveAsBtn.onclick = () => {
                let name = prompt("Enter new workspace name:");
                if (name) {
                    save(name);
                    updateDropdown();
                }
            };

            workspaceLoadBtn.onclick = load
            workspaceDeleteBtn.onclick = () => {
                remove();
                updateDropdown();
            };

            workspaceDownloadBtn.onclick = downloadWorkspace;

            // Workspace menu dropdown toggle
            const workspaceMenuBtn = document.getElementById("workspace-menu-btn");
            const workspaceMenuDropdown = document.getElementById("workspace-menu-dropdown");
            workspaceMenuBtn.onclick = (e) => {
                workspaceMenuDropdown.style.display = workspaceMenuDropdown.style.display === "none" ? "block" : "none";
            };
            document.addEventListener("click", (e) => {
                if (!workspaceMenuBtn.contains(e.target) && !workspaceMenuDropdown.contains(e.target)) {
                    workspaceMenuDropdown.style.display = "none";
                }
            });
        }

        init()

        return {}
    })()

    const ClingoManager = (() => {
        const Args = {
            stats: document.getElementById("stats"),
            profile: document.getElementById("profile"),
            project: document.getElementById("project"),
            reasoningMode: document.getElementById("reasoning-mode"),
            logLevel: document.getElementById("log-level"),
            mode: document.getElementById("mode")
        }
        const runButton = document.getElementById('clingoRun')
        const outputElement = document.getElementById('output')
        const pyCheckbox = document.querySelector('.language-switch input[type="checkbox"]')
        const examples = document.getElementById("examples")

        const clearOutput = () => {
            outputElement.textContent = ""
        }

        const updateOutput = (text) => {
            outputElement.textContent += `${text}\n`
        }

        const updateButton = (state) => {
            runButton.style.opacity = state === "ready" ? '100%' : '60%'
            if (state === "ready") {
                runButton.classList.remove("button--loading");
            }
            else {
                runButton.classList.add("button--loading");
            }
        }

        const ensurePython = () => {
            if (!pyCheckbox.checked && examples.options[examples.selectedIndex].classList.contains('option-py')) {
                pyCheckbox.checked = true
                return true
            }
            return false
        }

        const onEnablePython = (cb) => {
            pyCheckbox.addEventListener('change', (ev) => cb(ev.target.checked))
        }

        const onEnter = (cb) => {
            document.querySelector("#input").addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" && ev.ctrlKey) {
                    cb()
                }
            })
        }

        const buildArgs = () => {
            let args = []
            switch (Args.reasoningMode.value) {
                case "brave":
                    args.push(...["--opt-mode=optN", "--enum-mode=brave"])
                    break
                case "cautious":
                    args.push(...["--opt-mode=optN", "--enum-mode=cautious"])
                    break
                case "enumerate":
                    args.push(...["--opt-mode=optN", "0"])
                    break
                default:
                    break
            }
            args.push(...["--mode", Args.mode.value])
            args.push(...["--log-level", Args.logLevel.value])
            switch (Args.profile.value) {
                case "compact":
                    args.push("--profile=compact")
                    break
                case "detailed":
                    args.push("--profile")
                    break
                default:
                    break
            }
            if (Args.stats.checked) {
                args.push("--stats")
            }
            if (Args.project.checked) {
                args.push("--project")
            }
            return args
        }

        return {
            clearOutput,
            updateOutput,
            updateButton,
            ensurePython,
            onEnablePython,
            onEnter,
            buildArgs,
            getExample: () => examples.value,
            setExample: (value) => examples.value = value
        }
    })()

    const WorkerManager = (() => {
        let worker = null
        let state = "running"
        let stdin = ""
        let args = []
        let work = false
        let py = false
        let ispy = false

        const stripAnsiCodes = (input) => input.replace(/\x1b\[[0-9;]*m/g, '')

        const runClingo = () => {
            if (state == "ready") {
                if (work) {
                    ClingoManager.clearOutput()
                    state = "running"
                    work = false
                    worker.postMessage({ type: 'run', input: stdin, args: args })
                }
            }
            ClingoManager.updateButton(state)
        }

        const startWorker = () => {
            if (state == "ready" || state == "init") {
                return
            }
            state = "init"
            ClingoManager.updateButton(state)
            if (worker != null) {
                worker.terminate()
            }

            if (py) {
                ispy = true
                worker = new Worker('js/pyworker.js')
            } else {
                ispy = false
                worker = new Worker('js/worker.js')
            }

            worker.onmessage = (e) => {
                const msg = e.data
                switch (msg.type) {
                    case "init":
                        state = "ready"
                        runClingo()
                        break
                    case "ready":
                        worker.postMessage({ type: 'init' })
                        break
                    case "exit":
                        setTimeout(startWorker, 0)
                        break
                    case "stdout":
                        ClingoManager.updateOutput(msg.value)
                        break
                    case "stderr":
                        ClingoManager.updateOutput(stripAnsiCodes(msg.value))
                        break
                }
            }
        }

        const run = () => {
            work = true
            stdin = SessionManager.getContent()
            args = ClingoManager.buildArgs()
            startWorker()
            runClingo()
        }

        const enablePython = (enable) => {
            py = enable
            if (py != ispy) {
                state = "running"
                startWorker()
            }
        }

        return { run, enablePython, startWorker }
    })()

    const Control = (() => {
        const load = () => {
            path = ClingoManager.getExample()
            if (ClingoManager.ensurePython()) {
                WorkerManager.enablePython(true)
            }
            var request = new XMLHttpRequest()
            request.onreadystatechange = () => {
                if (request.readyState == 4 && request.status == 200) {
                    SessionManager.setInput(request.responseText.trim(), path)
                }
            }
            request.open("GET", `examples/${path}`, true)
            request.send()
        }

        const init = () => {
            ClingoManager.onEnablePython((enable) => WorkerManager.enablePython(enable))
            ClingoManager.onEnter(WorkerManager.run)
            const query_params = Object.fromEntries(
                Array.from(new URLSearchParams(window.location.search))
                    .map(([key, value]) => [key, decodeURIComponent(value)])
            )
            if (query_params.example !== undefined) {
                ClingoManager.setExample(query_params.example)
                load()
            }
            WorkerManager.startWorker()
        }

        init()

        return { load, run: WorkerManager.run, createTab: SessionManager.create }
    })()

    return Control
})()

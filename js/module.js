const Clingo = (() => {
    const DomInteraction = (() => {
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
        const tabList = document.getElementById("tabs");
        const inputElement = ace.edit("input")
        const examples = document.getElementById("examples")
        const sessions = [];
        const workspaceList = document.getElementById("workspace-list");
        const workspaceSaveBtn = document.getElementById("workspace-save");
        const workspaceSaveAsBtn = document.getElementById("workspace-saveas");
        const workspaceLoadBtn = document.getElementById("workspace-load");
        const workspaceDeleteBtn = document.getElementById("workspace-delete");
        let activeTab = null
        let selectedWorkspace = "";

        const Workspace = {
            list: () => Object.keys(localStorage).filter(k => k.startsWith("workspace:")).map(k => k.replace("workspace:", "")),
            save: (name) => {
                const data = sessions.map(s => ({
                    type: s.type,
                    name: s.name,
                    content: s.session.getValue()
                }));
                localStorage.setItem("workspace:" + name, JSON.stringify(data));
            },
            load: (name) => {
                const data = JSON.parse(localStorage.getItem("workspace:" + name) || "[]");
                sessions.forEach(session => {
                    session.tabEl.remove();
                    session.session.destroy();
                });
                sessions.length = 0;
                data.forEach(file => {
                    DomInteraction.createTab(file.type, file.name, file.content);
                });
            },
            delete: (name) => {
                localStorage.removeItem("workspace:" + name);
            }
        };

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

        const createTab = (type, name, content = null) => {
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

            inputElement.setOptions({
                maxLines: Infinity,
                autoScrollEditorIntoView: true
            })
            const session = ace.createEditSession("");
            session.$blockScrolling = Infinity
            session.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                mode: `ace/mode/${type}`,
            })

            sessions.push({ type, session, name, tabEl })

            inputElement.setSession(session);
            if (content !== null) { inputElement.setValue(content, 1); }

            tabEl.onclick = () => {
                inputElement.setSession(session)
                if (activeTab !== null) {
                    activeTab.classList.remove("active");
                }
                tabEl.classList.add("active");
                activeTab = tabEl;
                inputElement.focus();
            }
            tabEl.ondblclick = () => editTab(tabEl);
            tabEl.querySelector('.tab-close').onclick = (e) => {
                e.stopPropagation();
                const index = sessions.findIndex(s => s.session === session);
                if (index !== -1) {
                    sessions.splice(index, 1);
                }
                session.destroy();
                if (sessions.length === 0) {
                    activeTab = null;
                    createTab("clingo", "Untitled", "");
                }
                else if (tabEl.classList.contains("active")) {
                    inputElement.setSession(sessions[0].session);
                    sessions[0].tabEl.classList.add("active");
                    activeTab = sessions[0].tabEl;
                    inputElement.focus();
                }
                tabEl.remove();
            };
            tabList.appendChild(tabEl);

            tabEl.onclick();
        }

        const editTab = (tab) => {
            const nameSpan = tab.querySelector('.tab-name');
            const currentName = nameSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.width = '80%';
            nameSpan.textContent = '';
            nameSpan.appendChild(input);
            input.focus();

            input.onblur = function () {
                nameSpan.textContent = input.value;
                tab.ondblclick = function () { editTab(tab); };
                inputElement.focus();
            };
            input.onkeydown = function (e) {
                if (e.key === 'Enter') { input.blur(); }
                if (e.key === 'Escape') {
                    nameSpan.textContent = currentName;
                    tab.ondblclick = function () { editTab(tab); };
                    inputElement.focus();
                }
            };
            tab.ondblclick = null;
        }

        function updateWorkspaceDropdown() {
            const list = Workspace.list();
            workspaceList.innerHTML = "";
            list.forEach(name => {
                const item = document.createElement("div");
                item.textContent = name;
                item.className = "workspace-list-item";
                item.style.cursor = "pointer";
                item.onclick = () => {
                    selectedWorkspace = name;
                    document
                        .querySelectorAll('.workspace-list-item')
                        .forEach(el => el.classList.remove('selected'));
                    item.classList.add('selected');
                    workspaceLoadBtn.disabled = !selectedWorkspace;
                    workspaceDeleteBtn.disabled = !selectedWorkspace;
                    workspaceSaveBtn.disabled = !selectedWorkspace;
                };
                if (name === selectedWorkspace) {
                    item.classList.add('selected');
                }
                workspaceList.appendChild(item);
            });

            workspaceLoadBtn.disabled = !selectedWorkspace;
            workspaceDeleteBtn.disabled = !selectedWorkspace;
            workspaceSaveBtn.disabled = !selectedWorkspace;
        }

        const getInput = () => {
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
            sessions.forEach(session => {
                session.tabEl.remove();
                session.session.destroy();
            });
            sessions.length = 0;
            tabs.forEach(tab => {
                let lines = tab.content.trim().split('\n');
                let type = "clingo";
                if (lines.length >= 2 && lines[0].startsWith("#script(python)") && lines[lines.length - 1].startsWith("#end.")) {
                    type = "python";
                    lines.shift();
                    lines.pop();
                }
                createTab(type, tab.name, lines.join('\n'));
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
            updateWorkspaceDropdown()
            workspaceSaveBtn.onclick = () => {
                if (selectedWorkspace) {
                    Workspace.save(selectedWorkspace);
                    updateWorkspaceDropdown();
                }
            };
            workspaceSaveAsBtn.onclick = () => {
                let name = prompt("Enter new workspace name:");
                if (name) {
                    Workspace.save(name);
                    selectedWorkspace = name;
                    updateWorkspaceDropdown();
                }
            };

            workspaceLoadBtn.onclick = () => {
                if (selectedWorkspace) {
                    Workspace.load(selectedWorkspace);
                }
            };
            workspaceDeleteBtn.onclick = () => {
                if (selectedWorkspace) {
                    Workspace.delete(selectedWorkspace);
                    selectedWorkspace = "";
                    updateWorkspaceDropdown();
                }
            };

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

        return {
            createTab,
            clearOutput,
            updateOutput,
            updateButton,
            ensurePython,
            onEnablePython,
            onEnter,
            buildArgs,
            getInput,
            setInput,
            getExample: () => examples.value,
            setExample: (value) => examples.value = value
        }
    })()

    const Clingo = (() => {
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
                    DomInteraction.clearOutput()
                    state = "running"
                    work = false
                    worker.postMessage({ type: 'run', input: stdin, args: args })
                }
            }
            DomInteraction.updateButton(state)
        }

        const startWorker = () => {
            if (state == "ready" || state == "init") {
                return
            }
            state = "init"
            DomInteraction.updateButton(state)
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
                        DomInteraction.updateOutput(msg.value)
                        break
                    case "stderr":
                        DomInteraction.updateOutput(stripAnsiCodes(msg.value))
                        break
                }
            }
        }

        const run = () => {
            work = true
            stdin = DomInteraction.getInput()
            args = DomInteraction.buildArgs()
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
            path = DomInteraction.getExample()
            if (DomInteraction.ensurePython()) {
                Clingo.enablePython(true)
            }
            var request = new XMLHttpRequest()
            request.onreadystatechange = () => {
                if (request.readyState == 4 && request.status == 200) {
                    DomInteraction.setInput(request.responseText.trim(), path)
                }
            }
            request.open("GET", `examples/${path}`, true)
            request.send()
        }

        const init = () => {
            DomInteraction.onEnablePython((enable) => Clingo.enablePython(enable))
            DomInteraction.onEnter(Clingo.run)
            const query_params = Object.fromEntries(
                Array.from(new URLSearchParams(window.location.search))
                    .map(([key, value]) => [key, decodeURIComponent(value)])
            )
            if (query_params.example !== undefined) {
                DomInteraction.setExample(query_params.example)
                load()
            }
            Clingo.startWorker()
        }

        init()

        return { load, run: Clingo.run, createTab: DomInteraction.createTab }
    })()

    return Control
})()

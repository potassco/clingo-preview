const Clingo = (() => {
    const SessionView = (() => {
        const tabList = document.getElementById("tabs")
        const inputElement = ace.edit("input")

        const create = (icon, name, entry, receiver) => {
            const tabElement = document.createElement("li");
            tabElement.className = "tab-item";
            tabElement.innerHTML = `
                    <span class="tab-icon">${icon}</span>
                    <span class="tab-name">${name}</span>
                    <button class="tab-close" title="Close">&#10005;</button>
                `;
            tabList.appendChild(tabElement);
            tabElement.onclick = () => {
                receiver.dispatchEvent(new CustomEvent('tab-activate', { detail: entry }));
            }
            tabElement.ondblclick = () => {
                receiver.dispatchEvent(new CustomEvent('tab-edit', { detail: entry }));
            }
            tabElement.querySelector('.tab-close').onclick = (event) => {
                event.stopPropagation();
                receiver.dispatchEvent(new CustomEvent('tab-close', { detail: entry }));
            };
            return tabElement;
        }

        const edit = (entry, receiver) => {
            const nameSpan = entry.tabEl.querySelector('.tab-name');
            const currentName = nameSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.width = '80%';
            nameSpan.textContent = '';
            nameSpan.appendChild(input);
            input.focus();

            input.onblur = function () {
                receiver.dispatchEvent(new CustomEvent('tab-rename', { detail: { entry, name: input.value } }));
                nameSpan.textContent = input.value;
                entry.tabEl.ondblclick = function () { edit(entry, receiver); };
                inputElement.focus()
            }
            input.onkeydown = function (e) {
                if (e.key === 'Enter') { input.blur(); }
                if (e.key === 'Escape') {
                    nameSpan.textContent = currentName
                    entry.tabEl.ondblclick = () => edit(entry, receiver)
                    inputElement.focus()
                }
            }
            entry.tabEl.ondblclick = null;
        }

        const activate = (previous, entry, content = null) => {
            if (previous !== null) {
                previous.tabEl.classList.remove("active");
            }
            entry.tabEl.classList.add("active");
            inputElement.setSession(entry.session)
            if (content !== null) {
                inputElement.setValue(content, 1);
            }
            inputElement.focus();
        }

        const close = (entry) => entry.tabEl.remove()

        const getContent = () => inputElement.getValue()

        inputElement.setTheme("ace/theme/textmate")
        inputElement.$blockScrolling = Infinity
        inputElement.setOptions({
            useSoftTabs: true,
            tabSize: 4,
            maxLines: Infinity,
            autoScrollEditorIntoView: true
        })
        return { create, edit, close, activate, getContent }
    })()

    const SessionControl = (() => {
        const entries = []
        let active = null

        const self = new EventTarget();
        self.addEventListener('tab-activate', (e) => activate(e.detail))
        self.addEventListener('tab-edit', (e) => edit(e.detail))
        self.addEventListener('tab-close', (e) => close(e.detail))
        self.addEventListener('tab-rename', (e) => e.detail.entry.name = e.detail.name)

        const stringify = () => {
            const data = entries.map(entry => ({
                type: entry.type,
                name: entry.name,
                content: entry.session.getValue()
            }));
            return JSON.stringify(data)
        }

        const create = (type, name, content = null) => {
            let icon = "";
            if (type === "python") { icon = "🐍"; }
            else if (type === "clingo") { icon = "🦉"; }
            else {
                return;
            }
            const session = ace.createEditSession("");
            session.$blockScrolling = Infinity
            session.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                mode: `ace/mode/${type}`,
            })
            const entry = { type, session, name }
            entries.push(entry)
            entry.tabEl = SessionView.create(icon, name, entry, self);
            activate(entry, content)
        }

        const edit = (entry) => SessionView.edit(entry, self);

        const close = (entry) => {
            const index = entries.findIndex((other) => other === entry);
            if (index !== -1) {
                entries.splice(index, 1);
            }
            entry.session.destroy();
            SessionView.close(entry);
            if (entries.length === 0) {
                active = null;
                create("clingo", "Untitled", "");
            }
            else if (active === entry) {
                active = null
                activate(entries[0])
            }
        }

        const clear = () => {
            entries.forEach(entry => {
                SessionView.close(entry);
                entry.session.destroy();
            });
            entries.length = 0;
        }

        const activate = (entry, content = null) => {
            SessionView.activate(active, entry, content);
            active = entry;
        }

        const getContent = () => {
            let result = [];
            let first = true;
            for (const s of entries) {
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

        setInput(SessionView.getContent(), "harry-and-sally.lp")
        return { clear, stringify, create, setInput, getContent }
    })()

    const WorkspaceView = (() => {
        const workspaceList = document.getElementById("workspace-list");
        const workspaceSaveBtn = document.getElementById("workspace-save");
        const workspaceSaveAsBtn = document.getElementById("workspace-saveas");
        const workspaceLoadBtn = document.getElementById("workspace-load");
        const workspaceDeleteBtn = document.getElementById("workspace-delete");
        const workspaceDownloadBtn = document.getElementById("workspace-download");

        const update = (active, names, receiver) => {
            workspaceList.innerHTML = "";
            names.forEach(name => {
                const item = document.createElement("div");
                item.textContent = name;
                item.className = "workspace-list-item";
                item.style.cursor = "pointer";
                item.onclick = (e) => {
                    e.stopPropagation();
                    receiver.dispatchEvent(new CustomEvent('workspace-select', { detail: name }))
                }
                item.classList.toggle('selected', name === active);
                workspaceList.appendChild(item);
            });
            workspaceLoadBtn.disabled = active === null;;
            workspaceDeleteBtn.disabled = active === null;
            workspaceSaveBtn.disabled = active === null;
        }

        const init = (receiver) => {
            workspaceSaveBtn.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('workspace-save'));
            workspaceSaveAsBtn.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('workspace-save-as'))
            workspaceLoadBtn.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('workspace-load'))
            workspaceDeleteBtn.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('workspace-remove'))
            workspaceDownloadBtn.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('workspace-download'))

            // Workspace menu dropdown toggle
            const workspaceMenuBtn = document.getElementById("workspace-menu-btn");
            const workspaceMenuDropdown = document.getElementById("workspace-menu-dropdown");
            workspaceMenuBtn.onclick = () => {
                workspaceMenuDropdown.style.display = workspaceMenuDropdown.style.display === "none" ? "block" : "none";
            };
            document.addEventListener("click", (e) => {
                if (!workspaceMenuBtn.contains(e.target) && !workspaceMenuDropdown.contains(e.target)) {
                    workspaceMenuDropdown.style.display = "none";
                }
            });
        }

        return { init, update }
    })()

    const WorkspaceState = (() => {
        const self = new EventTarget();
        let active = null;

        const list = () => Object.keys(localStorage)
            .filter(k => k.startsWith("workspace:"))
            .map(k => k.replace("workspace:", ""))
            .sort();

        const update = () => {
            WorkspaceView.update(active, list(), self);
        }

        const save = () => {
            if (active !== null) {
                localStorage.setItem("workspace:" + active, SessionControl.stringify())
                update()
            }
        };

        const saveAs = () => {
            let name = prompt("Enter new workspace name:");
            if (name) {
                active = name;
                save(name);
            }
        }

        const load = () => {
            if (active !== null) {
                const data = JSON.parse(localStorage.getItem("workspace:" + active) || "[]");
                SessionControl.clear();
                data.forEach(file => {
                    SessionControl.create(file.type, file.name, file.content);
                });
            }
        };

        const remove = () => {
            if (active !== null) {
                localStorage.removeItem("workspace:" + active);
                active = null;
                update()
            }
        };

        function split(filename) {
            const idx = filename.lastIndexOf(".");
            if (idx <= 0) {
                return [filename, ""]
            }
            return [filename.slice(0, idx), filename.slice(idx)];
        }

        const sanitize = (name, existing) => {
            let base = name.replace(/[^a-zA-Z0-9_\-.]/g, "_").slice(0, 100);
            let [namePart, extPart] = split(base);
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

        const download = async () => {
            console.log("I was happening");
            await loadZipLib();
            const workspaceNames = list();
            if (workspaceNames.length === 0) {
                return;
            }
            const zip = new window.JSZip();
            const existingWS = {};
            for (const wsName of workspaceNames) {
                const data = JSON.parse(localStorage.getItem("workspace:" + wsName) || "[]");
                const folder = zip.folder(sanitize(wsName, existingWS));
                const existingLP = {};
                const existingPY = {};
                data.forEach(file => {
                    let existing = file.type === "python" ? existingPY : existingLP;
                    folder.file(sanitize(file.name, existing), file.content);
                });
            }
            const blob = await zip.generateAsync({ type: "blob" });
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `workspaces.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
        };

        const select = (name) => {
            active = name;
            update()
        };

        self.addEventListener('workspace-save', () => save())
        self.addEventListener('workspace-save-as', () => saveAs())
        self.addEventListener('workspace-remove', () => remove())
        self.addEventListener('workspace-select', (e) => select(e.detail))
        self.addEventListener('workspace-load', () => load())
        self.addEventListener('workspace-download', () => download())
        WorkspaceView.init(self)
        update()
        return {};
    })();

    const ClingoView = (() => {
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

    const ClingoControl = (() => {
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
                    ClingoView.clearOutput()
                    state = "running"
                    work = false
                    worker.postMessage({ type: 'run', input: stdin, args: args })
                }
            }
            ClingoView.updateButton(state)
        }

        const startWorker = () => {
            if (state == "ready" || state == "init") {
                return
            }
            state = "init"
            ClingoView.updateButton(state)
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
                        ClingoView.updateOutput(msg.value)
                        break
                    case "stderr":
                        ClingoView.updateOutput(stripAnsiCodes(msg.value))
                        break
                }
            }
        }

        const run = (content) => {
            work = true
            args = ClingoView.buildArgs()
            stdin = content
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
        const run = () => ClingoControl.run(SessionControl.getContent())

        const load = () => {
            path = ClingoView.getExample()
            if (ClingoView.ensurePython()) {
                ClingoControl.enablePython(true)
            }
            var request = new XMLHttpRequest()
            request.onreadystatechange = () => {
                if (request.readyState == 4 && request.status == 200) {
                    SessionControl.setInput(request.responseText.trim(), path)
                }
            }
            request.open("GET", `examples/${path}`, true)
            request.send()
        }

        const init = () => {
            ClingoView.onEnablePython((enable) => ClingoControl.enablePython(enable))
            ClingoView.onEnter(run)
            const query_params = Object.fromEntries(
                Array.from(new URLSearchParams(window.location.search))
                    .map(([key, value]) => [key, decodeURIComponent(value)])
            )
            if (query_params.example !== undefined) {
                ClingoView.setExample(query_params.example)
                load()
            }
            ClingoControl.startWorker()
        }

        init()

        return { load, run, createTab: SessionControl.create }
    })()

    return Control
})()

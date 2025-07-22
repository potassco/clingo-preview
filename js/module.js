const Clingo = (() => {
    /**
     * Utils module provides helper functions for string manipulation,
     * filename sanitization, and dynamic loading of external libraries.
     *
     * Functions:
     * - splitInput: Splits input string into tab objects based on tab markers.
     * - split: Splits a filename into name and extension.
     * - sanitize: Sanitizes and ensures unique filenames.
     * - loadZipLib: Dynamically loads the JSZip library if not already loaded.
     */
    const Utils = (() => {
        /**
         * Splits the input string into tab objects based on tab markers.
         *
         * Each tab marker should be in the format "%%% Tab: <tab name>".
         * Determines the type of each tab ("clingo" or "python") based on its
         * content. For python tabs, removes the script markers from the
         * content.
         *
         * @param {string} value - The input string containing tabbed content.
         * @param {string} name - The default name for the first tab if no marker is present.
         * @returns {Object[]} Array of tab objects with type, name, and content.
         */
        const splitInput = (value, name) => {
            const tabRegex = /^%%% Tab: (.+)$/gm;
            let match, lastIndex = 0, tabs = [];
            while ((match = tabRegex.exec(value)) !== null) {
                if (match.index > lastIndex) {
                    if (tabs.length > 0) {
                        tabs[tabs.length - 1].content = value.slice(lastIndex, match.index);
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
            tabs = tabs.map(tab => {
                let lines = tab.content.trim().split('\n');
                let type = "clingo";
                if (lines.length >= 2 && lines[0].startsWith("#script(python)") && lines[lines.length - 1].startsWith("#end.")) {
                    type = "python";
                    lines.shift();
                    lines.pop();
                }
                return { type, name: tab.name, content: lines.join('\n') }
            });
            return tabs;
        }

        /**
         * Splits a filename into name and extension.
         *
         * @param {string} filename - The filename to split.
         * @returns {[string, string]} Array with name and extension.
         */
        const split = (filename) => {
            const idx = filename.lastIndexOf(".");
            if (idx <= 0) {
                return [filename, ""]
            }
            return [filename.slice(0, idx), filename.slice(idx)];
        }

        /**
         * Sanitizes a filename and ensures uniqueness within a set.
         *
         * @param {string} name - The filename to sanitize.
         * @param {Object} existing - Object tracking existing filenames.
         * @returns {string} Unique, sanitized filename.
         */
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

        /**
         * Dynamically loads the JSZip library if not already loaded.
         *
         * @returns {Promise<void>} Resolves when JSZip is loaded.
         */
        const loadZipLib = async () => {
            if (!window.JSZip) {
                await new Promise((resolve) => {
                    const script = document.createElement('script');
                    script.src = "https://cdn.jsdelivr.net/npm/jszip@3.10.1/dist/jszip.min.js";
                    script.onload = resolve;
                    document.head.appendChild(script);
                });
            }
        }
        return { splitInput, sanitize, loadZipLib };
    })()

    /**
     * SessionModel manages a collection of session/tab entries and tracks the
     * active entry.
     *
     * Provides methods to create, remove, activate, and retrieve entries, as
     * well as utilities for splitting input and combining entry content.
     */
    class SessionModel {
        /**
         * Initializes a new SessionModel instance with an empty entries list
         * and no active entry.
         */
        constructor() {
            this.entries = [];
            this.active = null;
        }

        /**
         * Creates a new session entry with the given type and name, adds it to
         * the entries list, sets it as active if none is active, and returns
         * the created entry object.
         *
         * @param {string} type - The type of the session (e.g., "clingo", "python").
         * @param {string} name - The name of the session/tab.
         * @returns {Object} The newly created entry object.
         */
        create(type, name) {
            const entry = { type, name };
            this.entries.push(entry);
            if (this.active == null) {
                this.active = entry;
            }
            return entry;
        }

        /**
         * Removes the specified entry from the entries list.
         *
         * If the removed entry is currently active, sets the last entry as
         * active, or sets active to null if no entries remain.
         *
         * @param {Object} entry - The entry object to be removed.
         */
        close(entry) {
            this.entries = this.entries.filter(e => e !== entry);
            if (entry === this.active) {
                if (this.entries.length > 0) {
                    this.active = this.entries[this.entries.length - 1];
                }
                else {
                    this.active = null;
                }
            }
        }

        /**
         * Sets the specified entry as the currently active session/tab.
         *
         * @param {Object} entry - The entry object to set as active.
         */
        setActive(entry) {
            this.active = entry;
        }

        /**
         * Returns the currently active session/tab entry.
         *
         * @returns {Object|null} The active entry object, or null if none is active.
         */
        getActive() {
            return this.active;
        }

        /**
         * Returns the list of all session/tab entries.
         *
         * @returns {Object[]} Array of entry objects.
         */
        getEntries() {
            return this.entries;
        }

        /**
         * Removes all entries from the entries list and resets the active
         * entry to null.
         */
        clear() {
            this.entries.length = 0;
            this.active = null;
        }

        /**
         * Returns the combined content of all entries as a single string.
         *
         * Python entries are wrapped with script markers. Non-python entries
         * are prefixed with "#program base." except for the first one.
         *
         * @returns {string} The concatenated content of all entries.
         */
        getContent() {
            let first = true;
            return this.entries.map(entry => {
                if (entry.type === "python") {
                    return `#script(python)\n${entry.session.getValue()}\n#end.`;
                } else {
                    let prefix = "";
                    if (!first) {
                        prefix = "#program base.\n";
                    } else {
                        first = false;
                    }
                    return prefix + entry.session.getValue();
                }
            }).join('\n');
        }
    }

    /**
     * SessionView manages the user interface for session/tabs, including tab
     * creation, editing, activation, closing, and Ace editor integration.
     *
     * Emits custom events for user actions to be handled by the controller.
     */
    class SessionView extends EventTarget {
        /**
         * Initializes a new SessionView instance.
         *
         * Sets up the tab list element and configures the Ace editor.
         */
        constructor() {
            super();

            this.tabList = document.getElementById("tabs");
            this.inputElement = ace.edit("input");
            this.inputElement.setTheme("ace/theme/textmate");
            this.inputElement.$blockScrolling = Infinity;
            this.inputElement.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                maxLines: Infinity,
                autoScrollEditorIntoView: true
            });

            document.getElementById("tab-add-clingo").onclick = () =>
                this.dispatchEvent(new CustomEvent('tab-create', { detail: { type: 'clingo', name: 'Untitled' } }));
            document.getElementById("tab-add-python").onclick = () =>
                this.dispatchEvent(new CustomEvent('tab-create', { detail: { type: 'python', name: 'Untitled' } }));
        }

        /**
         * Creates a new tab element in the UI for the given entry.
         *
         * Sets up event listeners to emit custom events for tab activation,
         * editing, and closing.
         *
         * @param {Object} entry - The entry object associated with the tab.
         * @param {string} content - The initial content for the tab. Defaults to an empty string.
         */
        create(entry, content = "") {
            let icon = "";
            if (entry.type === "python") {
                icon = "🐍";
            }
            else {
                entry.type = "clingo"
                icon = "🦉";
            }

            entry.session = ace.createEditSession(content);
            entry.session.$blockScrolling = Infinity;
            entry.session.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                mode: `ace/mode/${entry.type}`,
            });

            entry.tabEl = document.createElement("li");
            entry.tabEl.className = "tab-item";
            entry.tabEl.innerHTML = `
                <span class="tab-icon" > ${icon}</span>
                <span class="tab-name">${entry.name}</span>
                <button class="tab-close" title="Close">&#10005;</button>
            `;
            this.tabList.appendChild(entry.tabEl);
            entry.tabEl.onclick = () => {
                this.dispatchEvent(new CustomEvent('tab-activate', { detail: entry }));
            };
            entry.tabEl.ondblclick = () => {
                this.dispatchEvent(new CustomEvent('tab-edit', { detail: entry }));
            };
            entry.tabEl.querySelector('.tab-close').onclick = (event) => {
                event.stopPropagation();
                this.dispatchEvent(new CustomEvent('tab-close', { detail: entry }));
            };
        }

        /**
         * Enables editing of a tab's name in the UI.
         *
         * Emits a custom 'tab-rename' event when editing is finished.
         *
         * @param {Object} entry - The entry object associated with the tab.
         */
        edit(entry) {
            const nameSpan = entry.tabEl.querySelector('.tab-name');
            const currentName = nameSpan.textContent;
            const input = document.createElement('input');
            input.type = 'text';
            input.value = currentName;
            input.style.width = '80%';
            nameSpan.textContent = '';
            nameSpan.appendChild(input);
            input.focus();

            input.onblur = () => {
                this.dispatchEvent(new CustomEvent('tab-rename', { detail: { entry, name: input.value } }));
                nameSpan.textContent = input.value;
                entry.tabEl.ondblclick = () => this.edit(entry);
                this.inputElement.focus();
            };
            input.onkeydown = (e) => {
                if (e.key === 'Enter') { input.blur(); }
                if (e.key === 'Escape') {
                    nameSpan.textContent = currentName;
                    entry.tabEl.ondblclick = () => this.edit(entry);
                    this.inputElement.focus();
                }
            };
            entry.tabEl.ondblclick = null;
        }

        /**
         * Activates the specified tab in the UI and sets its session in the
         * Ace editor.
         *
         * @param {Object|null} previous - The previously active entry, or null.
         * @param {Object} entry - The entry object to activate.
         */
        activate(previous, entry) {
            if (previous !== null) {
                previous.tabEl.classList.remove("active");
            }
            entry.tabEl.classList.add("active");
            this.inputElement.setSession(entry.session);
            this.inputElement.focus();
        }

        /**
         * Removes the specified tab from the UI and destroys its Ace session.
         *
         * @param {Object} entry - The entry object associated with the tab to close.
         */
        close(entry) {
            entry.tabEl.remove();
            entry.session.destroy();
        }

        /**
         * Returns the current content of the input element.
         *
         * This function is usesd initially to create a set of tabs with the
         * content loaded from the html file.
         *
         * @returns {string} The editor's content.
         */
        getInitialContent() {
            return this.inputElement.getValue();
        }
    }

    /**
     * SessionController orchestrates interactions between the SessionModel and SessionView.
     *
     * Listens for events emitted by the view and updates the model and view
     * accordingly. Handles session/tab creation, activation, editing, closing,
     * clearing, serialization, and input parsing.
     */
    class SessionController extends EventTarget {
        /**
         * Initializes a new SessionController instance, creates the model and
         * view, and sets up event listeners for view actions.
         */
        constructor() {
            super();

            this.model = new SessionModel();
            this.view = new SessionView();

            this.view.addEventListener('tab-activate', (e) => this.activate(e.detail));
            this.view.addEventListener('tab-edit', (e) => this.edit(e.detail));
            this.view.addEventListener('tab-close', (e) => this.close(e.detail));
            this.view.addEventListener('tab-rename', (e) => e.detail.entry.name = e.detail.name);
            this.view.addEventListener('tab-create', (e) => this.create(e.detail.type, e.detail.name));

            this.restore(this.view.getInitialContent(), "harry-and-sally.lp");
        }

        /**
         * Serializes all session entries to a JSON string.
         *
         * @returns {string} JSON representation of all session entries.
         */
        serialize() {
            const data = this.model.getEntries().map(entry => ({
                type: entry.type,
                name: entry.name,
                content: entry.session.getValue()
            }));
            return JSON.stringify(data);
        }

        /**
         * Restores the session from a json string.
         *
         * @param {string} repr JSON representation of all session entries.
         */
        deserialize(repr) {
            const data = JSON.parse(repr || "[]");
            this.clear();
            data.forEach(tab => {
                this.create(tab.type, tab.name, tab.content);
            });
        }

        /**
         * Creates a new session/tab with the specified type, name, and
         * content. Adds it to the model and view, and activates it.
         *
         * @param {string} type - The type of the session (e.g., "clingo", "python").
         * @param {string} name - The name of the session/tab.
         * @param {string} content - The initial content for the session/tab.
         */
        create(type, name, content = "") {
            const entry = this.model.create(type, name);
            this.view.create(entry, content);
            this.activate(entry);
        }

        /**
         * Enables editing of the specified entry's tab name in the view.
         *
         * @param {Object} entry - The entry object to edit.
         */
        edit(entry) {
            this.view.edit(entry);
        }

        /**
         * Closes the specified entry/tab, removes it from the model and view,
         * and activates another tab if available.
         *
         * @param {Object} entry - The entry object to close.
         */
        close(entry) {
            this.model.close(entry);
            this.view.close(entry);
            if (this.model.getEntries().length === 0) {
                this.create("clingo", "Untitled");
            } else {
                this.activate(this.model.getActive());
            }
        }

        /**
         * Removes all entries/tabs from the model and view.
         */
        clear() {
            this.model.getEntries().forEach(entry => this.view.close(entry));
            this.model.clear();
        }

        /**
         * Activates the specified entry/tab in the view and sets it as active
         * in the model.
         *
         * @param {Object} entry - The entry object to activate.
         * @param {string|null} content - Optional content to set in the editor.
         */
        activate(entry) {
            const previous = this.model.getActive();
            this.view.activate(previous, entry);
            this.model.setActive(entry);
        }

        /**
         * Returns the combined content of all entries/tabs as a single string.
         *
         * @returns {string} The concatenated content of all entries.
         */
        getContent() {
            return this.model.getContent();
        }

        /**
         * Parses the input string into tabs and creates them in the model and
         * view.
         *
         * @param {string} value - The input string containing tabbed content.
         * @param {string} name - The default name for the first tab if no marker is present.
         */
        restore(value, name) {
            const tabs = Utils.splitInput(value, name);
            this.clear();
            tabs.forEach(tab => {
                this.create(tab.type, tab.name, tab.content);
            });
        }
    }

    /**
     * WorkspaceModel manages workspaces stored in localStorage.
     *
     * Provides methods to list, activate, save, load, remove, and archive workspaces.
     * Each workspace is stored as a JSON string under the key "workspace:<name>".
     */
    class WorkspaceModel {
        /**
         * Initializes a new WorkspaceModel instance.
         */
        constructor() {
            this.active = null;
        }

        /**
         * Lists all workspace names stored in localStorage.
         *
         * @returns {string[]} Sorted array of workspace names.
         */
        list() {
            return Object.keys(localStorage)
                .filter(k => k.startsWith("workspace:"))
                .map(k => k.replace("workspace:", ""))
                .sort();
        }

        /**
         * Sets the active workspace by name.
         *
         * @param {string} name - Workspace name to set as active.
         */
        setActive(name) {
            this.active = name;
        }

        /**
         * Gets the currently active workspace name.
         *
         * @returns {string|null} The active workspace name or null.
         */
        getActive() {
            return this.active;
        }

        /**
         * Saves data to the currently active workspace.
         *
         * @param {string} data - JSON string to save.
         */
        save(data) {
            if (this.active !== null) {
                localStorage.setItem("workspace:" + this.active, data);
            }
        }

        /**
         * Saves data to a new workspace and sets it as active.
         *
         * @param {string} name - Workspace name.
         * @param {string} data - JSON string to save.
         */
        saveAs(name, data) {
            this.active = name;
            localStorage.setItem("workspace:" + name, data);
        }

        /**
         * Loads data from the currently active workspace.
         *
         * @returns {string|null} JSON string or null if not found.
         */
        load() {
            if (this.active !== null) {
                return localStorage.getItem("workspace:" + this.active);
            }
            return null;
        }

        /**
         * Removes the currently active workspace from localStorage.
         */
        remove() {
            if (this.active !== null) {
                localStorage.removeItem("workspace:" + this.active);
                this.active = null;
            }
        }

        /**
         * Archives all workspaces into a zip file blob.
         *
         * @returns {Promise<Blob|undefined>} Zip file blob containing all workspaces, or undefined if none.
         */
        async archive() {
            await Utils.loadZipLib();
            const workspaceNames = this.list();
            if (workspaceNames.length === 0) {
                return;
            }
            const zip = new window.JSZip();
            const existingWS = {};
            for (const wsName of workspaceNames) {
                const data = JSON.parse(localStorage.getItem("workspace:" + wsName) || "[]");
                const folder = zip.folder(Utils.sanitize(wsName, existingWS));
                const existingLP = {};
                const existingPY = {};
                data.forEach(file => {
                    let existing = file.type === "python" ? existingPY : existingLP;
                    folder.file(Utils.sanitize(file.name, existing), file.content);
                });
            }
            return await zip.generateAsync({ type: "blob" });
        }
    }

    /**
     * WorkspaceView manages the UI for workspace selection and actions.
     *
     * Handles displaying the workspace list, enabling/disabling action buttons,
     * and emitting events for save, load, remove, download, and selection.
     */
    class WorkspaceView extends EventTarget {
        /**
         * Initializes WorkspaceView and sets up UI elements and event listeners.
         */
        constructor() {
            super();

            this.workspaceList = document.getElementById("workspace-list");
            this.workspaceSaveBtn = document.getElementById("workspace-save");
            this.workspaceSaveAsBtn = document.getElementById("workspace-saveas");
            this.workspaceLoadBtn = document.getElementById("workspace-load");
            this.workspaceDeleteBtn = document.getElementById("workspace-delete");
            this.workspaceDownloadBtn = document.getElementById("workspace-download");
            this.workspaceMenuBtn = document.getElementById("workspace-menu-btn");
            this.workspaceMenuDropdown = document.getElementById("workspace-menu-dropdown");

            // Button event listeners
            this.workspaceSaveBtn.onclick = () =>
                this.dispatchEvent(new CustomEvent('workspace-save'));
            this.workspaceSaveAsBtn.onclick = () =>
                this.dispatchEvent(new CustomEvent('workspace-save-as'));
            this.workspaceLoadBtn.onclick = () =>
                this.dispatchEvent(new CustomEvent('workspace-load'));
            this.workspaceDeleteBtn.onclick = () =>
                this.dispatchEvent(new CustomEvent('workspace-remove'));
            this.workspaceDownloadBtn.onclick = () =>
                this.dispatchEvent(new CustomEvent('workspace-download'));

            // Menu dropdown toggle
            this.workspaceMenuBtn.onclick = () => {
                this.workspaceMenuDropdown.style.display = this.workspaceMenuDropdown.style.display === "none" ? "block" : "none";
            };
            document.addEventListener("click", (e) => {
                if (!this.workspaceMenuBtn.contains(e.target) && !this.workspaceMenuDropdown.contains(e.target)) {
                    this.workspaceMenuDropdown.style.display = "none";
                }
            });
        }

        /**
         * Updates the workspace list UI and button states.
         *
         * @param {string|null} active - The currently active workspace name.
         * @param {string[]} names - Array of workspace names.
         */
        update(active, names) {
            this.workspaceList.innerHTML = "";
            names.forEach(name => {
                const item = document.createElement("div");
                item.textContent = name;
                item.className = "workspace-list-item";
                item.style.cursor = "pointer";
                item.onclick = (e) => {
                    e.stopPropagation();
                    this.dispatchEvent(new CustomEvent('workspace-select', { detail: name }))
                }
                item.classList.toggle('selected', name === active);
                this.workspaceList.appendChild(item);
            });
            this.workspaceLoadBtn.disabled = active === null;
            this.workspaceDeleteBtn.disabled = active === null;
            this.workspaceSaveBtn.disabled = active === null;
        }
    }

    class WorkspaceController extends EventTarget {
        constructor() {
            super();

            this.session = new SessionController();
            this.model = new WorkspaceModel();
            this.view = new WorkspaceView();

            this.view.addEventListener('workspace-save', () => this.save());
            this.view.addEventListener('workspace-save-as', () => this.saveAs());
            this.view.addEventListener('workspace-remove', () => this.remove());
            this.view.addEventListener('workspace-select', (e) => this.select(e.detail));
            this.view.addEventListener('workspace-load', () => this.load());
            this.view.addEventListener('workspace-download', () => this.download());

            this.update();
        }

        restoreTabs(value, name) {
            this.session.restore(value, name);
        }

        getContent() {
            return this.session.getContent();
        }

        update() {
            this.view.update(this.model.getActive(), this.model.list(), this);
        }

        save() {
            this.model.save(this.session.serialize());
            this.update();
        }

        saveAs() {
            let name = prompt("Enter new workspace name:");
            if (name) {
                this.model.saveAs(name, this.session.serialize());
                this.update();
            }
        }

        load() {
            const data = this.model.load();
            if (data) {
                this.session.deserialize(data);
            }
        }

        remove() {
            this.model.remove();
            this.update();
        }

        select(name) {
            this.model.setActive(name);
            this.update();
        }

        async download() {
            const blob = await this.model.archive();
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = `workspaces.zip`;
            a.click();
            URL.revokeObjectURL(a.href);
        }

    }

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

        const init = (receiver) => {
            runButton.onclick = () =>
                receiver.dispatchEvent(new CustomEvent('run-request'));
            examples.onchange = (e) =>
                receiver.dispatchEvent(new CustomEvent('example-selected', { detail: e.target.value }))
            pyCheckbox.onchange = (e) =>
                receiver.dispatchEvent(new CustomEvent('python-toggle', { detail: e.target.checked }));
            document.querySelector("#input").addEventListener("keydown", (ev) => {
                if (ev.key === "Enter" && ev.ctrlKey) {
                    receiver.dispatchEvent(new CustomEvent('run-request'));
                }
            })
        }

        return {
            init,
            clearOutput,
            updateOutput,
            updateButton,
            ensurePython,
            buildArgs,
            getExample: () => examples.value,
            setExample: (value) => examples.value = value
        }
    })()

    const ClingoController = (() => {
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

        // NOTE: that events are handled by Control
        return { run, enablePython, startWorker }
    })()

    const Control = (() => {
        const self = new EventTarget();
        const workspaceController = new WorkspaceController();

        const query_params = Object.fromEntries(
            Array.from(new URLSearchParams(window.location.search))
                .map(([key, value]) => [key, decodeURIComponent(value)])
        )

        const run = () => ClingoController.run(workspaceController.getContent())

        const load = () => {
            path = ClingoView.getExample()
            if (ClingoView.ensurePython()) {
                ClingoController.enablePython(true)
            }
            var request = new XMLHttpRequest()
            request.onreadystatechange = () => {
                if (request.readyState == 4 && request.status == 200) {
                    workspaceController.restoreTabs(request.responseText.trim(), path)
                }
            }
            request.open("GET", `examples/${path}`, true)
            request.send()
        }

        self.addEventListener('run-request', () => run())
        self.addEventListener('python-toggle', (e) => ClingoController.enablePython(e.detail))
        self.addEventListener('example-selected', () => load())
        ClingoView.init(self)
        if (query_params.example !== undefined) {
            ClingoView.setExample(query_params.example)
            load()
        }
        ClingoController.startWorker()
    })()

    return Control
})()

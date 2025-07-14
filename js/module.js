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
        const inputElement = ace.edit("input")
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

        const init = () => {
            inputElement.setTheme("ace/theme/textmate")
            inputElement.$blockScrolling = Infinity
            inputElement.setOptions({
                useSoftTabs: true,
                tabSize: 4,
                maxLines: Infinity,
                mode: "ace/mode/clingo",
                autoScrollEditorIntoView: true
            })
        }

        init()

        return {
            clearOutput,
            updateOutput,
            updateButton,
            ensurePython,
            onEnablePython,
            onEnter,
            buildArgs,
            getInput: () => inputElement.getValue(),
            setInput: (value) => inputElement.setValue(value, 1),
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
                    DomInteraction.setInput(request.responseText.trim(), -1)
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

        return { load, run: Clingo.run }
    })()

    return Control
})()

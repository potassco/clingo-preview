const Clingo = (() => {
    const outputElement = document.getElementById('output')
    const inputElement = ace.edit("input")
    const stats = document.getElementById("stats")
    const project = document.getElementById("project")
    const mode = document.getElementById("mode")
    const logLevel = document.getElementById("log-level")
    const reasoningMode = document.getElementById("reasoning-mode")
    const examples = document.getElementById("examples")
    const indicator = document.getElementById('clingoRun')
    const pyCheckbox = document.querySelector('.language-switch input[type="checkbox"]');

    let worker = null;
    let state = "rujning";
    let stdin = ""
    let args = []
    let work = false
    let py = false
    let ispy = false

    inputElement.setTheme("ace/theme/textmate");
    inputElement.$blockScrolling = Infinity;
    inputElement.setOptions({
        useSoftTabs: true,
        tabSize: 4,
        maxLines: Infinity,
        mode: "ace/mode/clingo",
        autoScrollEditorIntoView: true
    });

    const stripAnsiCodes = (input) => input.replace(/\x1b\[[0-9;]*m/g, '');

    const clearOutput = () => {
        outputElement.textContent = "";
    }

    const updateOutput = (text) => {
        outputElement.textContent += `${text}\n`
    }

    const updateButton = () => {
        indicator.style.opacity = state === "ready" ? '100%' : '60%';
    }

    const buildArgs = () => {
        let args = []
        switch (reasoningMode.value) {
            case "brave":
                args.push(...["--opt-mode=optN", "--enum-mode=brave"])
                break;
            case "cautious":
                args.push(...["--opt-mode=optN", "--enum-mode=cautious"])
                break;
            case "enumerate":
                args.push(...["--opt-mode=optN", "0"]);
                break;
            default:
                break;
        }
        args.push(...["--mode", mode.value])
        args.push(...["--log-level", logLevel.value])
        if (stats.checked) {
            args.push("--stats");
        }
        if (project.checked) {
            args.push("--project");
        }
        return args;
    }

    const runClingo = () => {
        if (state == "ready") {
            if (work) {
                clearOutput()
                state = "running"
                work = false
                worker.postMessage({ type: 'run', input: stdin, args: args });
            }
        }
        updateButton()
    }

    const startWorker = () => {
        if (state == "ready" || state == "init") {
            return;
        }
        state = "init"
        updateButton()
        if (worker != null) {
            worker.terminate();
        }

        if (py) {
            ispy = true
            worker = new Worker('js/pyworker.js');
        } else {
            ispy = false
            worker = new Worker('js/worker.js');
        }

        worker.onmessage = (e) => {
            const msg = e.data
            switch (msg.type) {
                case "init":
                    state = "ready"
                    runClingo()
                    break;
                case "ready":
                    worker.postMessage({ type: 'init' });
                    break;
                case "exit":
                    setTimeout(startWorker, 0)
                    break;
                case "stdout":
                    updateOutput(msg.value);
                    break;
                case "stderr":
                    updateOutput(stripAnsiCodes(msg.value));
                    break;
            }
        };
    }

    const run = () => {
        work = true
        stdin = inputElement.getValue()
        args = buildArgs()
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

    const load = (path) => {
        if (!pyCheckbox.checked && examples.options[examples.selectedIndex].classList.contains('option-py')) {
            pyCheckbox.checked = true
            enablePython(true)
        }
        var request = new XMLHttpRequest();
        request.onreadystatechange = () => {
            if (request.readyState == 4 && request.status == 200) {
                inputElement.setValue(request.responseText.trim(), -1);
            }
        };
        request.open("GET", `examples/${path}`, true);
        request.send();
    };
    const loadExample = () => load(examples.value);

    document.querySelector("#input").addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && ev.ctrlKey) {
            run();
        }
    })

    document.addEventListener('DOMContentLoaded', () =>
        pyCheckbox.addEventListener('change', (ev) => enablePython(ev.target.checked))
    );

    const query_params = Object.fromEntries(
        Array.from(new URLSearchParams(window.location.search))
            .map(([key, value]) => [key, decodeURIComponent(value)])
    );
    if (query_params.example !== undefined) {
        examples.value = query_params.example;
        load(query_params.example);
    }

    startWorker()

    return { 'run': run, 'load': loadExample };
})();

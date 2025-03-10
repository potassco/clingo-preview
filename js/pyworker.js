importScripts("/js/pyodide/pyodide.js");

const messageSchemas = {
    run: {
        args: "array",
        input: "string",
    },
    init: {}
};

function validateMessage(msg, schemas) {
    if (!msg || typeof msg !== 'object') {
        return "Invalid message format: Expected an object.";
    }
    if (!msg.type || typeof msg.type !== 'string') {
        return "Invalid message: 'type' must be a string.";
    }
    const schema = schemas[msg.type];
    if (!schema) {
        return `Unknown message type: '${msg.type}'.`;
    }
    for (const [key, expectedType] of Object.entries(schema)) {
        const actualType = Array.isArray(msg[key]) ? "array" : typeof msg[key];
        if (actualType !== expectedType) {
            return `Invalid '${msg.type}' message: '${key}' must be of type '${expectedType}', but got '${actualType}'.`;
        }
    }
    return null;
}

const code = `
import __main__
from clingo.core import Library
from clingo.app import App, main as clingo_main
from clingo.script import Script, register

class PyScript(Script):
    def execute(self, code) -> None:
        exec(code, __main__.__dict__, __main__.__dict__)
    def call(self, lib, name: str, arguments):
        return [getattr(__main__, name)(lib, *arguments)]
    def callable(self, name, args):
        return name in __main__.__dict__ and callable(__main__.__dict__[name])
    def main(self, lib, control) -> None:
        __main__.main(lib, control)
    def name(self):
        return "python"

class ClingoApp(App):
    def __init__(self, name):
        super().__init__("clingo", "6.0.0")

def run_clingo_main(args):
    lib = Library()
    register(lib, PyScript())
    clingo_main(lib, args, ClingoApp("clingo"))
`;

class StdinHandler {
    constructor(input) {
        this.lines = input.split('\n');
        this.current = 0
    }
    stdin() {
        if (this.current < this.lines.length) {
            return this.lines[this.current++] + '\n';
        }
        return null;
    }
};

let pyodide = null

async function init() {
    postMessage({ type: "progress", value: "pyodide" });
    pyodide = await loadPyodide();
    await pyodide.loadPackage("clingo")
    pyodide.setStdout({ batched: (msg) => postMessage({ type: "stdout", value: msg }) });
    pyodide.setStderr({ batched: (msg) => postMessage({ type: "stderr", value: msg }) });
    await pyodide.runPythonAsync(code);
}

async function run(input, args) {
    try {
        pyodide.setStdin(new StdinHandler(input))
        pyodide.globals.get('run_clingo_main')(pyodide.toPy(args))
    } catch (error) {
        postMessage({ type: "stderr", value: error.toString() });
    }
}

self.addEventListener('message', (e) => {
    const msg = e.data
    const error = validateMessage(msg, messageSchemas);
    if (error) {
        postMessage({ type: "stderr", value: error });
    }
    else if (msg.type === 'init') {
        init().then(() => postMessage({ type: "init" }))
    }
    else if (msg.type === 'run') {
        run(msg.input, msg.args).then(() => postMessage({ type: "exit" }))
    }
})

postMessage({ type: "ready" })

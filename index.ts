// noinspection ExceptionCaughtLocallyJS

import * as fs from "fs";
import {Loader, Message, Plugin} from "esbuild";

export interface IPluginSettings {
    /**
     * Log detailed info.
     * Defaults to **false**.
     */
    verbose?: boolean;
    /**
     * Use custom parsing RegExp.
     */
    regExp?: RegExp;
    /**
     * File path regExp.
     * Defaults to `/\.[jt]sx?/`.
     */
    filePath?: RegExp;
    /**
     * Require ///.
     * Defaults to **true**.
     */
    requireTripleSlash?: boolean;
    /**
     * Fill line with spaces instead of commenting out.
     * Defaults to **false**.
     */
    fillWithSpaces?: boolean;
    /**
     * Variables for the expressions.
     * Defaults to **process.env**.
     */
    variables?: Record<string, any>;
}

const regExps = {
    double: /\/\/[\s]*#(?<token>.*?)(?:[\s]+(?<expression>.*?))?[\s]*$/,
    triple: /\/\/\/[\s]*#(?<token>.*?)(?:[\s]+(?<expression>.*?))?[\s]*$/
}

function ifdefPlugin(settings: IPluginSettings = {}): Plugin {
    const regExp = settings.regExp ?? (settings.requireTripleSlash !== false ? regExps.triple : regExps.double);
    const fileRegExp = settings.filePath ?? /\.[jt]sx?/;
    const variables = Object.freeze(settings.variables ?? {...process.env});

    function getToken(line): [string, string, number, number] {
        const match = line.match(regExp);
        if (match) return [match.groups.token, match.groups.expression ?? "", match.index, match[0].length];
    }

    function evalExpression(expression: string, line: number, file: string): boolean {
        const fn = new Function(...Object.keys(variables), 'return eval("' + expression + '")');
        try {
            const res = !!fn(...Object.values(variables));
            if (settings.verbose) console.log('Expression "' + expression + '" at ' + file + ':' + (line + 1) + ' resulted with ' + res);
            return res;
        } catch(e) {
            if (typeof e === "object") e.line = line;
            else {
                e = new Error('Error executing expression: ' + e);
                e.line = line;
            }
            throw e;
        }
    }

    function parseIf(warn: (msg: Partial<Message>) => void, file: string, lines: string[], start: number = 0, ignore: boolean = false): any {
        let remove = [];
        let prune = false;
        let done = false;
        let i;

        try {
            for (i = start; i < lines.length; i++) {
                const line = lines[i];
                const tokenData = getToken(line);
                if (prune || ignore) remove.push(i);
                if (!tokenData) {
                    if (!prune && !ignore && settings.verbose) console.log('Including ' + file + ':' + (i + 1));
                    continue;
                }
                remove.push(i);
                const [token, expression, column, length] = tokenData;

                switch (token) {
                    case "if": {
                        if (i !== start) {
                            const data = parseIf(warn, file, lines, i, prune || ignore);
                            i = data.end;
                            for (const n of data.remove) remove.push(n);
                        } else {
                            const exp = evalExpression(expression, i, file);
                            done = exp;
                            prune = !exp;
                        }
                        continue;
                    }
                    case "endif":
                        return {end: i, remove};
                }

                if (ignore || (prune && done)) continue;
                switch (token) {
                    case "else":
                        prune = done;
                        break;
                    case "elseif":
                    case "elif": {
                        const exp = evalExpression(expression, i, file);
                        prune = done || !exp;
                        if (!done) done = exp;
                    }
                }
                if (prune) continue;
                switch (token) {
                    case "warning":
                    case "warn":
                        warn({
                            text: expression,
                            location: {
                                line: i + 1,
                                lineText: lines[i],
                                column,
                                length
                            } as any,
                        })
                        break;
                    case "error":
                    case "err":
                        const err = new Error(expression) as any;
                        err.line = i;
                        throw err;
                }
            }
            throw new Error('Unterminated #if found on line ' + start);
        } catch (err) {
            const line = err.line ?? start;
            const tokenData = getToken(lines[line]);
            err.location = {
                line: line + 1,
                lineText: lines[line]
            }
            if (tokenData) {
                err.location.column = tokenData[2];
                err.location.length = tokenData[3];
            }
            throw err;
        }
    }

    function format(data: string, file: string, warn: (msg: Partial<Message>) => void) {
        let i;
        let remove = [];
        const lines = data.split('\n');

        for (i = 0; i < lines.length; i++) {
            const line = lines[i];
            const tokenData = getToken(line);
            if (!tokenData || tokenData[0] !== "if") continue;

            const data = parseIf(warn, file, lines, i, false);
            i = data.end;
            for (const n of data.remove) remove.push(n);
        }


        let mapped;
        if (settings.fillWithSpaces) mapped = lines.map((e, i) => remove.includes(+i) ? " ".repeat(e.length) : e);
        else mapped = lines.map((e, i) => remove.includes(+i) ? ("//" + e) : e);

        return mapped.join('\n');
    }

    const loaders = ['tsx', 'jsx', 'ts', 'js'];

    return {
        name: 'ifdef',
        setup(build) {
            build.onLoad({filter: fileRegExp}, async args => {
                const warnings: Message[] = [];
                try {
                    const text = await fs.promises.readFile(args.path, 'utf8');
                    const formatted = format(text, args.path, (msg) => warnings.push({
                        ...msg,
                        location: {...msg.location, file: args.path}
                    } as Message));
                    const path = args.path.split('.');
                    const ext = path[path.length - 1];
                    return {
                        contents: formatted,
                        warnings,
                        loader: (loaders.includes(ext) ? ext : 'js') as Loader
                    }
                } catch (e) {
                    if (!e.location) throw e;
                    return {
                        warnings,
                        errors: [{
                            text: e.message,
                            detail: e,
                            location: {
                                file: args.path,
                                ...e.location
                            }
                        }],
                    }
                }
            })
        }
    }
}

export default ifdefPlugin;
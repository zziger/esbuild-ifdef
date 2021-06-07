# esbuild-ifdef

This esbuild plugin allows you to include/exclude code from your bundle conditionally on compile time using `/// #if` comments.

## Installation

```bash
# npm
npm install esbuild-ifdef

#yarn
yarn add esbuild-ifdef
```

## Usage

Example:
```js
/// #if NODE_ENV === "production"
console.log('production specific code');
/// #elif NODE_ENV === "debug"
console.log('debug specific code');
/// #else
/// #warning Unknown NODE_ENV
console.log('something else');
/// #endif
```

All directives accept any valid javascript expressions.
If blocks can be nested.

## Available comments

- `/// #if expression`
- `/// #elseif expression`, `/// #elif expression`
- `/// #else`
- `/// #endif`
- `/// #warning text`, `/// #warn text` - shows up a warning at compile time
- `/// #error text`, `/// #err text` - throws an error at compile time

## Using plugin

```js
esbuild.build({
    entryPoints: ['./index.js'],
    bundle: true,
    target: 'es6',
    outfile: './out.js',
    plugins: [
        ifdefPlugin({
            variables: {
                VARIABLE_NAME: 'variable value'
            },
            // ... plugin config
        })
    ]
});
```

## Configuration

| Name                 | Type                  | Default       | Description
| -------------------- | --------------------- | ------------- | -----------
| `verbose`            | `boolean`             | `false`       | Enabled logging of the included strings and expression results
| `fillWithSpaces`     | `boolean`             | `false`       | Fill removed lines with spaces instead of commenting out
| `requireTripleSlash` | `boolean`             | `true`        | Require usage of /// before directives
| `filePath`           | `RegExp`              | `/\.[jt]sx?/` | File matching RegExp. 
| `regExp`             | `RegExp`              | -             | Custom parsing RegExp. Overrides `requireTripleSlash` option. RegExp should have one group named `token` and one group named `expression`. Default RegExp for parsing triple slash directives is `/\/\/\/[\s]*#(?<token>.*?)(?:[\s]+(?<expression>.*?))?[\s]*$/` 
| `variables`          | `Record<string, any>` | `process.env` | Variables for the expressions

## License

MIT
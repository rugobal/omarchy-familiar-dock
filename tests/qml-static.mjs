// Deliberately narrow load-time checks, independent of qmllint's type metadata.
// This is not a QML/JavaScript compiler. Strip literals/comments before looking
// at declarations so examples, URLs and messages cannot become false errors.
function codeOnly(source) {
  return source.replace(/\/\*[\s\S]*?\*\/|\/\/[^\n]*|"(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`/g,
    text => text.replace(/[^\n]/g, ' '));
}

export function readonlyErrors(files) {
  const parsed = Object.entries(files).map(([file, source]) => {
    const code = codeOnly(source), objects = [], stack = [];
    const tokens = [...code.matchAll(/[A-Za-z_$][\w$]*|===|==|=>|\+\+|--|[{}.:=;]/g)];
    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i][0];
      if (token === '{') {
        const prior = tokens[i - 1]?.[0] || '';
        const behavior = tokens[i - 2]?.[0] === 'on' && tokens[i - 3]?.[0] === 'Behavior';
        const type = /^[A-Z]/.test(prior) ? prior : '';
        const object = type || behavior ? {type, parent: [...stack].reverse().find(s => s.object)?.object,
          readonly: new Set(), assignments: [], behaviors: [], id: ''} : null;
        if (object) objects.push(object);
        if (behavior && object.parent) object.parent.behaviors.push({name: prior, at: tokens[i - 3].index});
        stack.push({object});
      } else if (token === '}') stack.pop();
      else {
        // Only direct object members are declarations/bindings, not JS locals.
        const object = stack.at(-1)?.object;
        if (!object) continue;
        if (token === 'readonly' && tokens[i + 1]?.[0] === 'property') {
          // Also handle list<T> types (angle brackets are irrelevant here).
          let j = i + 3;
          while (tokens[j] && ![':', ';', '{', '}'].includes(tokens[j][0])) j++;
          if (tokens[j]?.[0] === ':') object.readonly.add(tokens[j - 1][0]);
        }
        if (token === 'id' && tokens[i + 1]?.[0] === ':') object.id = tokens[i + 2]?.[0];
        if (tokens[i + 1]?.[0] === ':' && /(?:^|[;{}\n])\s*$/.test(code.slice(0, tokens[i].index)))
          object.assignments.push({name: token, at: tokens[i].index});
      }
    }
    return {file, code, objects};
  });
  const types = new Map(parsed.map(p => [p.file.split('/').at(-1).replace(/\.qml$/, ''), p.objects[0]]));
  const errors = [];
  for (const {file, code, objects} of parsed) {
    const report = (at, message) => errors.push(`${file}:${code.slice(0, at).split('\n').length}: ${message}`);
    const properties = (object, seen = new Set()) => {
      if (!object || seen.has(object)) return new Set();
      seen.add(object);
      return new Set([...object.readonly, ...properties(types.get(object.type), seen)]);
    };
    for (const object of objects) {
      const readonly = properties(object);
      for (const {name, at} of object.behaviors)
        if (readonly.has(name)) report(at, `Behavior on readonly property ${name}`);
      // A separate binding on an inherited or locally declared readonly member.
      for (const {name, at} of object.assignments)
        if (readonly.has(name) && !/readonly\s+property\s+[^:;{}]+$/.test(code.slice(0, at)))
          report(at, `binding to readonly property ${name}`);
      if (object.id) {
        const writes = new RegExp(`\\b${object.id}\\s*\\.\\s*(\\w+)\\s*(:|=(?!=|>))`, 'g');
        for (const match of code.matchAll(writes)) {
          if (match[2] === ':' && !/(?:^|[;{}\n])\s*$/.test(code.slice(0, match.index))) continue;
          if (readonly.has(match[1])) report(match.index, `assignment to readonly property ${object.id}.${match[1]}`);
        }
      }
    }
  }
  return errors;
}

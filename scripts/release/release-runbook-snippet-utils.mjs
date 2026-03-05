export const normalizeLineEndings = (value) => value.replace(/\r\n/gu, '\n');

export const dedent = (value) => {
  const lines = value.split('\n');
  const nonEmpty = lines.filter((line) => line.trim().length > 0);
  if (nonEmpty.length === 0) {
    return value;
  }
  const minIndent = nonEmpty.reduce((current, line) => {
    const match = line.match(/^ */u);
    const indent = match ? match[0].length : 0;
    return Math.min(current, indent);
  }, Number.POSITIVE_INFINITY);
  return lines.map((line) => line.slice(minIndent)).join('\n');
};

export const extractTextFencedSnippetAfterMarker = ({ markdown, marker }) => {
  const markerIndex = markdown.indexOf(marker);
  if (markerIndex < 0) {
    return '';
  }
  const trailing = markdown.slice(markerIndex);
  const match = trailing.match(/```text\n([\s\S]*?)\n\s*```/u);
  return match ? dedent(match[1]).trim() : '';
};

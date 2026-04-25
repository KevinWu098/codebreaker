interface Props {
  maxHeight?: number;
  value: unknown;
}

const colorize = (value: unknown): string => {
  const json = JSON.stringify(value, null, 2) ?? "undefined";

  return json
    .replace(/(&)/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(
      /"([^"\\]*(?:\\.[^"\\]*)*)"(\s*:)/g,
      '<span class="json-key">"$1"</span>$2'
    )
    .replace(
      /: ?"([^"\\]*(?:\\.[^"\\]*)*)"/g,
      ': <span class="json-string">"$1"</span>'
    )
    .replace(/: ?(-?\d+(?:\.\d+)?)/g, ': <span class="json-number">$1</span>')
    .replace(/: ?(true|false)/g, ': <span class="json-bool">$1</span>')
    .replace(/: ?(null)/g, ': <span class="json-null">$1</span>');
};

export const JsonView = ({ value, maxHeight }: Props): React.JSX.Element => {
  const style = maxHeight ? { maxHeight: `${maxHeight}px` } : undefined;

  return (
    <pre
      className="json-view"
      // biome-ignore lint/security/noDangerouslySetInnerHtml: trusted local JSON.stringify output
      dangerouslySetInnerHTML={{ __html: colorize(value) }}
      style={style}
    />
  );
};

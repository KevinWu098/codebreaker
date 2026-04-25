import { Fragment, useMemo } from "react";
import { cn } from "@/lib/cn";

interface JsonViewProps {
  className?: string;
  maxHeight?: number;
  value: unknown;
}

type TokenKind = "key" | "str" | "num" | "bool" | "null" | "plain";

interface Token {
  kind: TokenKind;
  /** Byte offset in the source string — unique and stable across re-renders. */
  offset: number;
  text: string;
}

const TOKEN_REGEX =
  /"(?:[^"\\]|\\.)*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?/g;

const tokenize = (json: string): Token[] => {
  const tokens: Token[] = [];
  let cursor = 0;

  for (const match of json.matchAll(TOKEN_REGEX)) {
    const start = match.index ?? 0;

    if (start > cursor) {
      tokens.push({
        kind: "plain",
        offset: cursor,
        text: json.slice(cursor, start),
      });
    }

    const matchText = match[0];
    const colonSuffix = match[1];

    if (matchText.startsWith('"')) {
      if (colonSuffix === undefined) {
        tokens.push({ kind: "str", offset: start, text: matchText });
      } else {
        const stringPart = matchText.slice(
          0,
          matchText.length - colonSuffix.length
        );
        tokens.push({ kind: "key", offset: start, text: stringPart });
        tokens.push({
          kind: "plain",
          offset: start + stringPart.length,
          text: colonSuffix,
        });
      }
    } else if (matchText === "true" || matchText === "false") {
      tokens.push({ kind: "bool", offset: start, text: matchText });
    } else if (matchText === "null") {
      tokens.push({ kind: "null", offset: start, text: matchText });
    } else {
      tokens.push({ kind: "num", offset: start, text: matchText });
    }

    cursor = start + matchText.length;
  }

  if (cursor < json.length) {
    tokens.push({ kind: "plain", offset: cursor, text: json.slice(cursor) });
  }

  return tokens;
};

export const JsonView = ({
  className,
  maxHeight,
  value,
}: JsonViewProps): React.JSX.Element => {
  const tokens = useMemo(() => {
    const json = JSON.stringify(value, null, 2) ?? "undefined";
    return tokenize(json);
  }, [value]);
  const style = maxHeight ? { maxHeight: `${maxHeight}px` } : undefined;

  return (
    <pre className={cn("json-view", className)} style={style}>
      {tokens.map((token) => {
        const key = `${token.kind}@${token.offset}`;

        if (token.kind === "plain") {
          return <Fragment key={key}>{token.text}</Fragment>;
        }

        return (
          <span className={token.kind} key={key}>
            {token.text}
          </span>
        );
      })}
    </pre>
  );
};

import { useMemo } from "react";
import { JsonView as RawJsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { CopyTextButton } from "@/components/copy-text-button";
import { cn } from "@/lib/cn";

export const valueToCopyString = (value: unknown): string => {
  if (typeof value === "string") {
    return value;
  }

  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
};

interface JsonViewProps {
  className?: string;
  collapsedDepth?: number;
  maxHeight?: number;
  showCopy?: boolean;
  value: unknown;
}

type RawJsonViewProps = React.ComponentProps<typeof RawJsonView>;
type StyleProps = NonNullable<RawJsonViewProps["style"]>;

const STYLES: StyleProps = {
  ariaLables: {
    collapseJson: "collapse",
    expandJson: "expand",
  },
  basicChildStyle: "rjv-row",
  booleanValue: "rjv-bool",
  childFieldsContainer: "rjv-children",
  clickableLabel: "rjv-key rjv-key-clickable",
  collapseIcon: "rjv-icon rjv-icon-collapse",
  collapsedContent: "rjv-collapsed",
  container: "rjv-container",
  expandIcon: "rjv-icon rjv-icon-expand",
  label: "rjv-key",
  noQuotesForStringValues: false,
  nullValue: "rjv-null",
  numberValue: "rjv-num",
  otherValue: "rjv-other",
  punctuation: "rjv-punct",
  quotesForFieldNames: false,
  stringifyStringValues: false,
  stringValue: "rjv-str",
};

const ensureRenderable = (value: unknown): object | unknown[] => {
  if (Array.isArray(value)) {
    return value;
  }

  if (value !== null && typeof value === "object") {
    return value as object;
  }

  return { value };
};

export const JsonView = ({
  className,
  collapsedDepth = 2,
  maxHeight,
  showCopy = true,
  value,
}: JsonViewProps): React.JSX.Element => {
  const copyText = useMemo(() => valueToCopyString(value), [value]);
  const outerStyle = maxHeight ? { maxHeight: `${maxHeight}px` } : undefined;

  return (
    <div className={cn("json-view", className)} style={outerStyle}>
      {showCopy ? (
        <div className="json-view-toolbar flex shrink-0 items-center justify-end border-border/80 border-b px-0.5 py-0.5">
          <CopyTextButton text={copyText} title="copy json" />
        </div>
      ) : null}
      <div
        className={cn(
          "json-view-body min-h-0 overflow-auto p-2",
          maxHeight && "flex-1"
        )}
      >
        <RawJsonView
          clickToExpandNode
          data={ensureRenderable(value)}
          shouldExpandNode={(level) => level < collapsedDepth}
          style={STYLES}
        />
      </div>
    </div>
  );
};

import { JsonView as RawJsonView } from "react-json-view-lite";
import "react-json-view-lite/dist/index.css";
import { cn } from "@/lib/cn";

interface JsonViewProps {
  className?: string;
  collapsedDepth?: number;
  maxHeight?: number;
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
  value,
}: JsonViewProps): React.JSX.Element => {
  const style = maxHeight ? { maxHeight: `${maxHeight}px` } : undefined;

  return (
    <div className={cn("json-view", className)} style={style}>
      <RawJsonView
        clickToExpandNode
        data={ensureRenderable(value)}
        shouldExpandNode={(level) => level < collapsedDepth}
        style={STYLES}
      />
    </div>
  );
};

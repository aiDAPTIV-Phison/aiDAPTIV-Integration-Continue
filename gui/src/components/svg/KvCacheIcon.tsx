interface KvCacheIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number;
}

export function KvCacheIcon({
  size = 24,
  className,
  ...props
}: KvCacheIconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="1.5"
      className={className}
      {...props}
    >
      {/* Cache/memory blocks (three horizontal lines on the left) */}
      <line x1="2" y1="8" x2="10" y2="8" />
      <line x1="2" y1="12" x2="10" y2="12" />
      <line x1="2" y1="16" x2="10" y2="16" />

      {/* Vertical divider */}
      <line x1="13" y1="5" x2="13" y2="19" />

      {/* K letter */}
      <text
        x="16"
        y="11"
        fontFamily="monospace"
        fontSize="8"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
      >
        K
      </text>

      {/* V letter */}
      <text
        x="16"
        y="19"
        fontFamily="monospace"
        fontSize="8"
        fontWeight="bold"
        fill="currentColor"
        stroke="none"
      >
        V
      </text>
    </svg>
  );
}

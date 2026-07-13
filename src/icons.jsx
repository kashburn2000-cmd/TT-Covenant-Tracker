// Minimal inline SVG icon set — 1.6px stroke, inherits the text color so
// icons follow whatever color the surrounding control sets. Purely visual;
// every icon is aria-hidden and sized to sit inline with 11–13px UI text.
const Svg = ({ size = 13, children, style }) => (
  <svg
    width={size} height={size} viewBox="0 0 24 24" aria-hidden="true"
    fill="none" stroke="currentColor" strokeWidth="1.8"
    strokeLinecap="round" strokeLinejoin="round"
    style={{ flexShrink: 0, verticalAlign: '-2px', ...style }}
  >{children}</svg>
);

export const LockIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 8 0v4" />
  </Svg>
);

export const UnlockIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <rect x="5" y="11" width="14" height="9" rx="2" />
    <path d="M8 11V7a4 4 0 0 1 7.7-1.5" />
  </Svg>
);

export const SunIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <circle cx="12" cy="12" r="4.2" />
    <path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5.2 5.2l1.7 1.7M17.1 17.1l1.7 1.7M18.8 5.2l-1.7 1.7M6.9 17.1l-1.7 1.7" />
  </Svg>
);

export const MoonIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M20.5 14.5A8.5 8.5 0 0 1 9.5 3.5a8.5 8.5 0 1 0 11 11z" />
  </Svg>
);

export const EyeIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Svg>
);

export const EyeOffIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M4 4l16 16" />
    <path d="M9.9 5.9A9.4 9.4 0 0 1 12 5.5c6 0 9.5 6.5 9.5 6.5a17.6 17.6 0 0 1-3.2 3.9M6.1 8.3A17 17 0 0 0 2.5 12S6 18.5 12 18.5a9 9 0 0 0 3.5-.7" />
  </Svg>
);

export const CameraIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M4 8h3l2-2.5h6L17 8h3a1.5 1.5 0 0 1 1.5 1.5V18a1.5 1.5 0 0 1-1.5 1.5H4A1.5 1.5 0 0 1 2.5 18V9.5A1.5 1.5 0 0 1 4 8z" />
    <circle cx="12" cy="13.5" r="3.2" />
  </Svg>
);

export const PencilIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M4 20l1-4L16.5 4.5a2.1 2.1 0 0 1 3 3L8 19l-4 1z" />
  </Svg>
);

export const ClockIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <circle cx="12" cy="12" r="8.5" />
    <path d="M12 7.5V12l3 2" />
  </Svg>
);

export const CommentIcon = ({ size, style }) => (
  <Svg size={size} style={style}>
    <path d="M20.5 12a8.5 8.5 0 0 1-12.6 7.4L3.5 20.5l1.1-4.4A8.5 8.5 0 1 1 20.5 12z" />
  </Svg>
);

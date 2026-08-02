const DEFAULT_FOLDER_COLOR = '#8a8f99'

// Matches Google Drive's own folder glyph so folders read the same way they
// do in the real Drive app — including the color the person picked there.
export default function DriveFolderIcon({ color, size = 40 }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <path
        d="M3 6.5C3 5.67 3.67 5 4.5 5h4.4c.34 0 .67.12.93.34l1.6 1.33c.26.22.6.34.94.34H19.5c.83 0 1.5.67 1.5 1.5v9.17c0 .83-.67 1.5-1.5 1.5h-15C3.67 19.17 3 18.5 3 17.67V6.5Z"
        fill={color || DEFAULT_FOLDER_COLOR}
      />
    </svg>
  )
}

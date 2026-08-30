/**
 * Decorative contour lines behind the home hero.
 *
 * Loosely traces the shape of the Isle of Portland, which is the island the
 * club runs on and the shape inside its logo. Purely atmospheric — it carries
 * no information, so it is hidden from assistive technology.
 */
export function ContourBackdrop() {
  return (
    <svg
      className="hero__contours"
      viewBox="0 0 600 400"
      preserveAspectRatio="xMidYMid slice"
      aria-hidden="true"
      focusable="false"
    >
      <g fill="none" stroke="currentColor" strokeWidth="1.1" strokeLinejoin="round">
        <path d="M300 30c58 14 92 62 96 128 4 66-16 132-52 178-24 30-58 44-92 34-40-12-64-52-70-104-7-62 6-128 42-176 20-27 46-46 76-60Z" />
        <path d="M300 62c46 12 74 52 78 108 4 56-14 112-44 150-20 26-48 38-76 30-33-10-53-44-58-88-6-52 5-108 35-148 17-22 39-38 65-52Z" />
        <path d="M300 94c34 10 56 42 60 88 3 46-12 92-36 122-16 21-38 31-60 25-26-8-42-36-46-72-5-42 4-88 28-120 13-18 31-30 54-43Z" />
        <path d="M300 126c22 8 38 32 41 68 2 36-10 72-28 94-12 16-28 24-45 19-19-6-31-28-34-56-4-32 3-68 21-92 10-14 23-23 45-33Z" />
        <path d="M300 158c12 6 20 22 22 48 1 26-7 52-20 68-8 11-18 17-31 13-12-4-20-20-22-40-3-22 2-48 14-66 7-10 15-16 37-23Z" />
      </g>
    </svg>
  );
}

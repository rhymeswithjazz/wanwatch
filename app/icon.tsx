import { ImageResponse } from 'next/og';

// Image metadata
export const size = {
  width: 32,
  height: 32,
};

export const contentType = 'image/png';

// Image generation - Radio/Signal icon for WAN monitoring
export default function Icon() {
  return new ImageResponse(
    (
      <div
        style={{
          fontSize: 24,
          background: '#2563eb',
          width: '100%',
          height: '100%',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          color: 'white',
          borderRadius: '20%',
        }}
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="white"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="2" fill="white" />
          <path d="M4.93 19.07a10 10 0 0 1 0-14.14" />
          <path d="M7.76 16.24a6 6 0 0 1 0-8.49" />
          <path d="M16.24 7.76a6 6 0 0 1 0 8.49" />
          <path d="M19.07 4.93a10 10 0 0 1 0 14.14" />
        </svg>
      </div>
    ),
    {
      ...size,
    }
  );
}

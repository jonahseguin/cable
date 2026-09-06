import { Html, Head, Body } from '@react-email/components';

interface EmailWrapperProps {
  children?: React.ReactNode;
}

export default function EmailWrapper({ children }: EmailWrapperProps) {
  return (
    <Html>
      <Head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        {/* eslint-disable-next-line @next/next/no-page-custom-font */}
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
        <style>
          {`
            u + #body a {
                color: inherit;
                text-decoration: none;
                font-size: inherit;
                font-family: inherit;
                font-weight: inherit;
                line-height: inherit;
            }
          `}
        </style>
      </Head>
      <Body
        style={{ fontFamily: 'Inter, sans-serif', backgroundColor: '#f5f5f5', paddingTop: '24px' }}
      >
        {children}
      </Body>
    </Html>
  );
}

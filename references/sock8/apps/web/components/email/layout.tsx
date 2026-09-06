import * as React from 'react';
import { Container, Section, Row, Column, Text } from '@react-email/components';
import { CommandIcon } from 'lucide-react';
import EmailIcon from './icon';

interface EmailLayoutProps {
  /** The main content of the email */
  children: React.ReactNode;
  /** The recipient's email address shown in the footer */
  recipientEmail?: string;
  /** Title displayed at the top of the email */
  title?: React.ReactNode;
  /** Optional top accent bar color class (defaults to primary gradient) */
  accentClass?: string;
}

export function EmailLayout({ children, recipientEmail, title }: EmailLayoutProps) {
  // Convert tailwind colors to actual HSL values based on the theme
  const colors = {
    background: 'hsl(240, 33%, 99%)',
    foreground: 'hsl(240, 10%, 3.9%)',
    card: 'hsl(0, 0%, 100%)',
    cardForeground: 'hsl(240, 10%, 3.9%)',
    primary: 'hsl(160, 84%, 39%)',
    primaryForeground: 'hsl(0, 0%, 100%)',
    muted: 'hsla(160, 10%, 95%, 0.1)',
    mutedForeground: 'hsl(160, 10%, 40%)',
    accent: 'hsl(160, 84%, 30%)',
    accentForeground: 'hsl(0, 0%, 100%)',
    border: 'hsla(160, 10%, 90%, 0.1)',
  };

  // Custom styles for the email layout
  const styles = {
    container: {
      margin: '0 auto',
      maxWidth: '500px',
      width: '100%',
    },
    emailContainer: {
      borderRadius: '16px',
      overflow: 'hidden',
      border: `1px solid ${colors.border}`,
      backgroundColor: colors.card,
      marginBottom: '4px',
    },
    accentBar: {
      height: '4px',
      width: '100%',
      background: `linear-gradient(to right, ${colors.accent}, ${colors.primary}, ${colors.accent}80)`,
    },
    headerContainer: {
      textAlign: 'center' as const,
    },
    headerPaddingCell: {
      paddingTop: '24px',
      paddingBottom: '24px',
    },
    title: {
      fontSize: '24px',
      fontWeight: 'bold',
      color: colors.foreground,
      margin: '0',
      lineHeight: '32px',
    },
    contentContainer: {
      padding: '0',
    },
    contentPaddingCell: {
      padding: '0 24px',
    },
    contentSpacer: {
      marginBottom: '24px',
    },
    footerContainer: {
      backgroundColor: colors.muted,
      borderTop: `1px solid ${colors.border}`,
      marginTop: '16px',
    },
    footerPaddingCell: {
      paddingBottom: '24px',
    },
    iconContainer: {
      width: '24px',
      height: '24px',
      backgroundColor: colors.primary,
      borderRadius: '50%',
      textAlign: 'center' as const,
      verticalAlign: 'middle',
      lineHeight: '24px',
      fontSize: 0,
    },
    iconStyle: {
      color: colors.primaryForeground,
      width: '14px',
      height: '14px',
      display: 'inline-block',
      verticalAlign: 'middle',
    },
    brandText: {
      fontSize: '14px',
      margin: 0,
      fontWeight: '500',
      paddingLeft: '8px',
      color: colors.foreground,
    },
    recipientText: {
      fontSize: '14px',
      margin: 0,
      color: colors.mutedForeground,
      textAlign: 'right' as const,
      display: 'inline-block',
    },
    emailShadow1: {
      margin: '0 12px',
      height: '4px',
      borderRadius: '0 0 16px 16px',
      border: `1px solid ${colors.border}`,
      backgroundColor: `${colors.border}`,
    },
    emailShadow2: {
      margin: '0 24px',
      height: '2px',
      borderRadius: '0 0 16px 16px',
      border: `1px solid ${colors.border}`,
      backgroundColor: `${colors.border}`,
    },
    innerContainer: {
      maxWidth: '450px',
      margin: '0 auto',
      width: '100%',
      paddingLeft: '8px',
      paddingRight: '8px',
    },
    teamNameHighlight: {
      color: colors.primary,
      fontWeight: 'bold',
    },
    iconCenteringCellStyle: {
      verticalAlign: 'middle' as const,
      textAlign: 'center' as const,
      width: '100%',
      height: '100%',
      lineHeight: '24px',
      fontSize: 0,
    },
  };

  return (
    <Container style={styles.container}>
      {/* Email container */}
      <Section style={styles.emailContainer}>
        {/* Accent top bar */}
        <div style={styles.accentBar}></div>

        {/* Header - if title is provided */}
        {title && (
          <Section style={styles.headerContainer}>
            {/* Wrapper table for header padding */}
            <table style={{ width: '100%' }}>
              <tbody>
                <tr>
                  <td style={styles.headerPaddingCell}>
                    <div style={styles.innerContainer}>
                      <Text style={styles.title}>{title}</Text>
                    </div>
                  </td>
                </tr>
              </tbody>
            </table>
          </Section>
        )}

        {/* Main content */}
        <Section style={styles.contentContainer}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={styles.contentPaddingCell}>
                  <div style={styles.innerContainer}>
                    <div style={styles.contentSpacer}>{children}</div>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        {/* Footer */}
        <Section style={styles.footerContainer}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={styles.footerPaddingCell}>
                  <div style={styles.innerContainer}>
                    <Row>
                      <Column>
                        <Row>
                          <Column style={{ width: '30%' }}>
                            <Row>
                              <Column style={{ width: '24px' }}>
                                <div style={styles.iconContainer}>
                                  <EmailIcon icon={CommandIcon} style={styles.iconStyle} />
                                </div>
                              </Column>
                              <Column>
                                <Text style={styles.brandText}>sock8</Text>
                              </Column>
                            </Row>
                          </Column>
                          <Column style={{ width: '70%', textAlign: 'right' }}>
                            {recipientEmail && (
                              <Text style={styles.recipientText}>Sent to {recipientEmail}</Text>
                            )}
                          </Column>
                        </Row>
                      </Column>
                    </Row>
                  </div>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>
      </Section>

      {/* Email shadow effect */}
      <div style={styles.emailShadow1} aria-hidden="true" />
      <div style={styles.emailShadow2} aria-hidden="true" />
    </Container>
  );
}

import * as React from 'react';
import { z } from 'zod';
import { defineEmailTemplate } from '@/lib/email-utils';
import { Section, Text, Img, Link, Row, Column } from '@react-email/components';
import { EmailLayout } from '../layout';
import EmailIcon from '../icon';

const schema = z.object({
  inviterName: z.string(),
  teamName: z.string(),
  inviteLink: z.string().url(),
  inviteeEmail: z.string().email(),
  role: z.string(),
  inviterAvatar: z.string().url().nullable().optional(),
});

const defaultProps = {
  inviterName: 'Alex Adewole',
  teamName: 'sock8',
  inviteLink: 'https://app.sock8.com/accept-invite/abc123',
  inviteeEmail: 'new.member@example.com',
  role: 'CTO',
  inviterAvatar: null,
};

export default defineEmailTemplate({
  title: 'Team Invite',
  schema,
  formatSubject: ({ inviterName, teamName }) =>
    `${inviterName} invited you to join ${teamName} on sock8!`,
  react: ({ inviterName, teamName, inviteLink, inviteeEmail, role, inviterAvatar }) => {
    const initials = inviterName
      ?.split(' ')
      .map((n) => n[0])
      .join('')
      .substring(0, 2)
      .toUpperCase();

    const emailTitle = (
      <>
        You've been invited to
        {` `}
        <span style={{ color: colors.primary, fontWeight: 'bold' }}>{teamName}</span>!
      </>
    );

    return (
      <EmailLayout title={emailTitle} recipientEmail={inviteeEmail}>
        <Section style={inviterCardSectionStyle}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={contentPaddingCellStyle}>
                  <Row>
                    <Column style={avatarColumnLeftStyle}>
                      <div style={avatarWrapperStyle}>
                        {inviterAvatar ? (
                          <Img src={inviterAvatar} alt={inviterName} style={avatarStyle} />
                        ) : (
                          <div style={avatarFallbackStyle}>{initials}</div>
                        )}
                      </div>
                    </Column>
                    <Column style={avatarColumnRightStyle}>
                      <Text style={inviterNameStyle}>{inviterName}</Text>
                      <Text style={roleContainerStyle}>
                        <span style={roleStyle}>{role}</span>
                        &nbsp;•&nbsp;
                        <span style={invitedTextStyle}>invited you</span>
                      </Text>
                    </Column>
                  </Row>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Section style={descriptionSectionStyle}>
          <table style={{ width: '100%' }}>
            <tbody>
              <tr>
                <td style={contentPaddingCellStyle}>
                  <Row>
                    <Column style={descriptionIconColumnStyle}>
                      {/* Fixed icon centering block */}
                      <table
                        width={iconContainerSize}
                        cellPadding={0}
                        cellSpacing={0}
                        border={0}
                        style={{
                          width: iconContainerSize,
                          height: iconContainerSize,
                          backgroundColor: 'hsla(160, 84%, 30%, 0.1)',
                          borderRadius: borderRadius.full,
                        }}
                      >
                        <tbody>
                          <tr>
                            <td
                              align="center"
                              valign="middle"
                              style={{
                                width: iconContainerSize,
                                height: iconContainerSize,
                                textAlign: 'center',
                                verticalAlign: 'middle',
                              }}
                            >
                              <EmailIcon
                                alt="lightning bolt"
                                style={{
                                  display: 'block',
                                  margin: '0 auto',
                                }}
                                svg={
                                  <svg
                                    width="13"
                                    height="13"
                                    viewBox="0 0 24 24"
                                    fill="none"
                                    stroke={colors.accent}
                                    strokeWidth="2"
                                    strokeLinecap="round"
                                    strokeLinejoin="round"
                                  >
                                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                                  </svg>
                                }
                              />
                            </td>
                          </tr>
                        </tbody>
                      </table>
                    </Column>
                    <Column style={descriptionTextColumnStyle}>
                      <Text style={descriptionTextStyle}>
                        <span style={descriptionHighlightStyle}>WebSockets made easy</span> with
                        end-to-end type safety. No headaches, just pure, productive flow.
                      </Text>
                    </Column>
                  </Row>
                </td>
              </tr>
            </tbody>
          </table>
        </Section>

        <Link href={inviteLink} style={ctaButtonStyle}>
          <table style={ctaInnerTableStyle}>
            <tbody>
              <tr>
                <td style={ctaTextCellStyle}>Accept invitation</td>
                <td style={ctaIconCellStyle}>
                  <EmailIcon
                    alt="arrow right"
                    style={arrowIconStyle}
                    svg={
                      <svg
                        width="14"
                        height="14"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="#ffffff"
                        strokeWidth="2"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      >
                        <path d="M5 12h14" />
                        <path d="m12 5 7 7-7 7" />
                      </svg>
                    }
                  />
                </td>
              </tr>
            </tbody>
          </table>
        </Link>

        <Section style={alternativeLinkSectionStyle}>
          <Text style={alternativeLinkTextStyle}>or paste this link:</Text>
          <div style={linkCodeStyle}>
            <Text style={linkCodeTextStyle}>{inviteLink}</Text>
          </div>
        </Section>
      </EmailLayout>
    );
  },
  defaultProps,
});

// Styling constants remain unchanged

const colors = {
  background: 'hsl(240, 33%, 99%)',
  foreground: 'hsl(240, 10%, 3.9%)',
  card: 'hsl(0, 0%, 100%)',
  cardForeground: 'hsl(240, 10%, 3.9%)',
  primary: 'hsl(160, 84%, 39%)',
  primaryForeground: 'hsl(0, 0%, 100%)',
  secondary: 'hsl(160, 84%, 20%)',
  secondaryForeground: 'hsl(0, 0%, 100%)',
  muted: 'hsl(160, 10%, 95%)',
  mutedForeground: 'hsl(160, 10%, 40%)',
  accent: 'hsl(160, 84%, 30%)',
  accentForeground: 'hsl(0, 0%, 100%)',
  border: 'hsl(160, 10%, 90%)',
};

const spacing = {
  xs: '2px',
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  sectionGap: '16px',
};

const borderRadius = {
  sm: '4px',
  md: '8px',
  lg: '12px',
  xl: '16px',
  full: '9999px',
};

const avatarSize = '40px';
const iconContainerSize = '28px';

const inviterCardSectionStyle = {
  borderRadius: borderRadius.xl,
  border: `1px solid hsla(160, 10%, 90%, 0.3)`,
  background: colors.card,
  marginBottom: spacing.sectionGap,
} as const;

const descriptionSectionStyle = {
  borderRadius: borderRadius.xl,
  border: `1px solid hsla(160, 10%, 90%, 0.3)`,
  backgroundColor: 'hsla(160, 10%, 95%, 0.2)',
  marginBottom: spacing.sectionGap,
} as const;

const contentPaddingCellStyle = {
  padding: spacing.lg,
} as const;

const alternativeLinkSectionStyle = {
  borderRadius: borderRadius.md,
  border: `1px solid hsla(160, 10%, 90%, 0.1)`,
  backgroundColor: 'hsla(160, 10%, 95%, 0.1)',
  padding: `${spacing.md} ${spacing.lg}`,
  textAlign: 'center' as const,
  overflow: 'hidden',
} as const;

const avatarColumnLeftStyle = {
  width: avatarSize,
  paddingRight: spacing.lg,
  verticalAlign: 'middle' as const,
} as const;

const avatarColumnRightStyle = {
  verticalAlign: 'middle' as const,
} as const;

const descriptionIconColumnStyle = {
  width: iconContainerSize,
  paddingRight: spacing.lg,
  verticalAlign: 'top' as const,
} as const;

const descriptionTextColumnStyle = {
  verticalAlign: 'top' as const,
} as const;

const avatarWrapperStyle = {
  position: 'relative' as const,
  width: avatarSize,
  height: avatarSize,
} as const;

const avatarStyle = {
  display: 'block',
  width: avatarSize,
  height: avatarSize,
  borderRadius: borderRadius.full,
  objectFit: 'cover' as const,
} as const;

const avatarFallbackStyle = {
  width: avatarSize,
  height: avatarSize,
  borderRadius: borderRadius.full,
  backgroundColor: colors.muted,
  color: colors.accent,
  fontSize: '14px',
  fontWeight: 500,
  lineHeight: avatarSize,
  textAlign: 'center' as const,
} as const;

const inviterNameStyle = {
  color: colors.foreground,
  fontSize: '14px',
  fontWeight: 500,
  margin: 0,
  lineHeight: 1.4,
} as const;

const roleContainerStyle = {
  color: colors.mutedForeground,
  fontSize: '12px',
  margin: 0,
  lineHeight: 1.4,
} as const;

const roleStyle = {
  fontWeight: 500,
} as const;

const invitedTextStyle = {
  color: colors.accent,
} as const;

const descriptionTextStyle = {
  color: colors.mutedForeground,
  fontSize: '12px',
  lineHeight: '1.6',
  margin: 0,
} as const;

const descriptionHighlightStyle = {
  color: colors.foreground,
  fontWeight: 500,
} as const;

const ctaButtonStyle = {
  display: 'block',
  backgroundColor: colors.accent,
  color: colors.accentForeground,
  width: '100%',
  paddingTop: '10px',
  paddingBottom: '10px',
  borderRadius: borderRadius.md,
  textAlign: 'center' as const,
  fontWeight: 500,
  boxShadow: '0 1px 2px 0 rgba(0, 0, 0, 0.05)',
  textDecoration: 'none',
  marginBottom: spacing.sectionGap,
} as const;

const ctaInnerTableStyle = {
  display: 'inline-block',
  verticalAlign: 'middle',
} as const;

const ctaTextCellStyle = {
  paddingRight: spacing.md,
  verticalAlign: 'middle' as const,
} as const;

const ctaIconCellStyle = {
  verticalAlign: 'middle' as const,
} as const;

const arrowIconStyle = {
  verticalAlign: 'middle' as const,
  display: 'block',
} as const;

const alternativeLinkTextStyle = {
  color: colors.mutedForeground,
  fontSize: '12px',
  margin: 0,
  lineHeight: 1.4,
} as const;

const linkCodeStyle = {
  display: 'block',
  backgroundColor: `hsla(160, 10%, 95%, 0.3)`,
  borderRadius: borderRadius.sm,
  padding: spacing.sm,
  overflow: 'hidden',
  marginTop: spacing.sm,
} as const;

const linkCodeTextStyle = {
  color: colors.primary,
  fontFamily: 'monospace',
  fontSize: '10px',
  margin: 0,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap' as const,
} as const;

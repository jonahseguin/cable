import { z } from 'zod';

/**
 * Zod schema for team roles
 */
export const teamRoleSchema = z.enum(['owner', 'admin', 'member']);

/**
 * Zod schema for team members
 */
export const teamMemberSchema = z.object({
  id: z.string(),
  email: z.string().email('Please enter a valid email address'),
  role: teamRoleSchema,
});

/**
 * Zod schema for team data
 */
export const teamDataSchema = z.object({
  name: z.string().min(1, 'Team name is required'),
  picture: z.string().nullable(),
  members: z.array(teamMemberSchema).min(1, 'At least one team member is required'),
});

/**
 * Zod schema for profile data needed for onboarding
 */
export const profileDataSchema = z.object({
  name: z.string().min(1, 'Name is required'),
  picture: z.string().nullable(),
  // We're ignoring other profile fields for now as requested
});

/**
 * Zod schema for combined onboarding data
 */
export const onboardingDataSchema = z.object({
  team: teamDataSchema,
  profile: profileDataSchema,
});

/**
 * Zod schema for the server action response
 */
export const teamSetupResponseSchema = z.object({
  success: z.boolean(),
  organizationId: z.string().optional(),
  error: z.string().optional(),
});

/**
 * Type definitions derived from Zod schemas
 */
export type TeamRole = z.infer<typeof teamRoleSchema>;
export type TeamMember = z.infer<typeof teamMemberSchema>;
export type TeamData = z.infer<typeof teamDataSchema>;
export type ProfileData = z.infer<typeof profileDataSchema>;
export type OnboardingData = z.infer<typeof onboardingDataSchema>;
export type TeamSetupResponse = z.infer<typeof teamSetupResponseSchema>;

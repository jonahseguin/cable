import { c } from "@cablejs/contract";
import { z } from "zod";

const forbiddenError = z.object({ resource: z.string() });
const rateLimitedError = z.object({ retryAfter: z.number().positive() });
const mutedError = z.object({ until: z.number() });
const conflictError = z.object({ version: z.number().int() });
const channelForbiddenError = z.object({ reason: z.string() });

export const api = c.contract({
  group0: {
    section0: {
      procedure0: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(0),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(0) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure1: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(1),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(1) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure2: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(2),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(2) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure3: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(3),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(3) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure4: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(4),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(4) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure5: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(5),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(5) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure6: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(6),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(6) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure7: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(7),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(7) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure8: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(8),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(8) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure9: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(9),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(9) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section1: {
      procedure10: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(10),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(10) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure11: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(11),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(11) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure12: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(12),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(12) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure13: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(13),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(13) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure14: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(14),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(14) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure15: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(15),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(15) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure16: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(16),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(16) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure17: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(17),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(17) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure18: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(18),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(18) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure19: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(19),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(19) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section2: {
      procedure20: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(20),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(20) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure21: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(21),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(21) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure22: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(22),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(22) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure23: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(23),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(23) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure24: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(24),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(24) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure25: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(25),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(25) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure26: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(26),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(26) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure27: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(27),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(27) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure28: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(28),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(28) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure29: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(29),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(29) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section3: {
      procedure30: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(30),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(30) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure31: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(31),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(31) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure32: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(32),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(32) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure33: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(33),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(33) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure34: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(34),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(34) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure35: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(35),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(35) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure36: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(36),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(36) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure37: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(37),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(37) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure38: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(38),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(38) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure39: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(39),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(39) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
  },
  group1: {
    section0: {
      procedure40: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(40),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(40) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure41: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(41),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(41) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure42: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(42),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(42) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure43: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(43),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(43) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure44: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(44),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(44) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure45: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(45),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(45) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure46: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(46),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(46) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure47: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(47),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(47) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure48: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(48),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(48) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure49: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(49),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(49) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section1: {
      procedure50: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(50),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(50) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure51: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(51),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(51) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure52: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(52),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(52) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure53: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(53),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(53) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure54: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(54),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(54) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure55: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(55),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(55) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure56: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(56),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(56) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure57: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(57),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(57) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure58: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(58),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(58) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure59: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(59),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(59) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section2: {
      procedure60: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(60),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(60) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure61: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(61),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(61) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure62: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(62),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(62) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure63: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(63),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(63) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure64: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(64),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(64) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure65: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(65),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(65) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure66: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(66),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(66) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure67: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(67),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(67) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure68: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(68),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(68) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure69: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(69),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(69) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section3: {
      procedure70: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(70),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(70) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure71: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(71),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(71) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure72: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(72),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(72) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure73: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(73),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(73) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure74: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(74),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(74) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure75: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(75),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(75) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure76: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(76),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(76) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure77: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(77),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(77) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure78: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(78),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(78) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure79: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(79),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(79) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
  },
  group2: {
    section0: {
      procedure80: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(80),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(80) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure81: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(81),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(81) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure82: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(82),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(82) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure83: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(83),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(83) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure84: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(84),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(84) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure85: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(85),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(85) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure86: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(86),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(86) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure87: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(87),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(87) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure88: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(88),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(88) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure89: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(89),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(89) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section1: {
      procedure90: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(90),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(90) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure91: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(91),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(91) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure92: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(92),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(92) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure93: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(93),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(93) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure94: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(94),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(94) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure95: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(95),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(95) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure96: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(96),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(96) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure97: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(97),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(97) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure98: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(98),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(98) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure99: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(99),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(99) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section2: {
      procedure100: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(100),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(100) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure101: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(101),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(101) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure102: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(102),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(102) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure103: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(103),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(103) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure104: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(104),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(104) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure105: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(105),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(105) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure106: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(106),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(106) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure107: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(107),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(107) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure108: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(108),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(108) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure109: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(109),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(109) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section3: {
      procedure110: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(110),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(110) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure111: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(111),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(111) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure112: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(112),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(112) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure113: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(113),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(113) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure114: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(114),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(114) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure115: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(115),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(115) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure116: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(116),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(116) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure117: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(117),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(117) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure118: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(118),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(118) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure119: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(119),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(119) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
  },
  group3: {
    section0: {
      procedure120: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(120),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(120) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure121: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(121),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(121) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure122: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(122),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(122) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure123: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(123),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(123) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure124: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(124),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(124) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure125: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(125),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(125) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure126: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(126),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(126) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure127: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(127),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(127) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure128: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(128),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(128) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure129: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(129),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(129) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section1: {
      procedure130: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(130),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(130) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure131: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(131),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(131) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure132: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(132),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(132) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure133: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(133),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(133) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure134: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(134),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(134) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure135: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(135),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(135) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure136: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(136),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(136) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure137: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(137),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(137) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure138: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(138),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(138) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure139: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(139),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(139) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section2: {
      procedure140: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(140),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(140) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure141: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(141),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(141) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure142: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(142),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(142) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure143: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(143),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(143) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure144: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(144),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(144) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure145: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(145),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(145) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure146: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(146),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(146) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure147: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(147),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(147) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure148: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(148),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(148) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure149: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(149),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(149) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section3: {
      procedure150: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(150),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(150) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure151: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(151),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(151) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure152: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(152),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(152) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure153: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(153),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(153) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure154: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(154),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(154) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure155: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(155),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(155) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure156: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(156),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(156) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure157: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(157),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(157) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure158: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(158),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(158) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure159: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(159),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(159) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
  },
  group4: {
    section0: {
      procedure160: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(160),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(160) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure161: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(161),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(161) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure162: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(162),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(162) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure163: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(163),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(163) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure164: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(164),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(164) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure165: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(165),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(165) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure166: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(166),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(166) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure167: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(167),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(167) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure168: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(168),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(168) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure169: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(169),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(169) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section1: {
      procedure170: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(170),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(170) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure171: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(171),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(171) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure172: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(172),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(172) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure173: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(173),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(173) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure174: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(174),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(174) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure175: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(175),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(175) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure176: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(176),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(176) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure177: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(177),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(177) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure178: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(178),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(178) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure179: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(179),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(179) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section2: {
      procedure180: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(180),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(180) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure181: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(181),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(181) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure182: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(182),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(182) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure183: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(183),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(183) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure184: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(184),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(184) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure185: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(185),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(185) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure186: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(186),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(186) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure187: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(187),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(187) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure188: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(188),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(188) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure189: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(189),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(189) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
    section3: {
      procedure190: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(190),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(190) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure191: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(191),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(191) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure192: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(192),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(192) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure193: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(193),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(193) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure194: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(194),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(194) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure195: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(195),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(195) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure196: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(196),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(196) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure197: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(197),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(197) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure198: c.query({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(198),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(198) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
      procedure199: c.mutation({
        input: z.object({
          id: z.string(),
          cursor: z.number().int().optional(),
          marker: z.literal(199),
        }),
        output: z.object({ id: z.string(), accepted: z.boolean(), marker: z.literal(199) }),
        errors: {
          FORBIDDEN: forbiddenError,
          RATE_LIMITED: rateLimitedError,
        },
      }),
    },
  },
  channels: {
    channel0: c.channel("channel0.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(0), id: z.string() }),
        updated: z.object({ channel: z.literal(0), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(0), id: z.string() }),
        typing: z.object({ channel: z.literal(0), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(0) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(0) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(0) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(0) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(0) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(0) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(0) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(0) }),
    }),
    channel1: c.channel("channel1.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(1), id: z.string() }),
        updated: z.object({ channel: z.literal(1), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(1), id: z.string() }),
        typing: z.object({ channel: z.literal(1), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(1) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(1) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(1) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(1) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(1) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(1) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(1) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(1) }),
    }),
    channel2: c.channel("channel2.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(2), id: z.string() }),
        updated: z.object({ channel: z.literal(2), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(2), id: z.string() }),
        typing: z.object({ channel: z.literal(2), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(2) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(2) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(2) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(2) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(2) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(2) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(2) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(2) }),
    }),
    channel3: c.channel("channel3.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(3), id: z.string() }),
        updated: z.object({ channel: z.literal(3), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(3), id: z.string() }),
        typing: z.object({ channel: z.literal(3), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(3) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(3) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(3) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(3) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(3) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(3) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(3) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(3) }),
    }),
    channel4: c.channel("channel4.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(4), id: z.string() }),
        updated: z.object({ channel: z.literal(4), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(4), id: z.string() }),
        typing: z.object({ channel: z.literal(4), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(4) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(4) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(4) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(4) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(4) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(4) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(4) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(4) }),
    }),
    channel5: c.channel("channel5.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(5), id: z.string() }),
        updated: z.object({ channel: z.literal(5), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(5), id: z.string() }),
        typing: z.object({ channel: z.literal(5), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(5) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(5) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(5) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(5) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(5) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(5) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(5) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(5) }),
    }),
    channel6: c.channel("channel6.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(6), id: z.string() }),
        updated: z.object({ channel: z.literal(6), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(6), id: z.string() }),
        typing: z.object({ channel: z.literal(6), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(6) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(6) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(6) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(6) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(6) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(6) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(6) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(6) }),
    }),
    channel7: c.channel("channel7.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(7), id: z.string() }),
        updated: z.object({ channel: z.literal(7), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(7), id: z.string() }),
        typing: z.object({ channel: z.literal(7), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(7) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(7) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(7) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(7) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(7) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(7) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(7) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(7) }),
    }),
    channel8: c.channel("channel8.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(8), id: z.string() }),
        updated: z.object({ channel: z.literal(8), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(8), id: z.string() }),
        typing: z.object({ channel: z.literal(8), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(8) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(8) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(8) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(8) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(8) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(8) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(8) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(8) }),
    }),
    channel9: c.channel("channel9.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(9), id: z.string() }),
        updated: z.object({ channel: z.literal(9), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(9), id: z.string() }),
        typing: z.object({ channel: z.literal(9), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(9) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(9) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(9) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(9) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(9) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(9) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(9) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(9) }),
    }),
    channel10: c.channel("channel10.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(10), id: z.string() }),
        updated: z.object({ channel: z.literal(10), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(10), id: z.string() }),
        typing: z.object({ channel: z.literal(10), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(10) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(10) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(10) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(10) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(10) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(10) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(10) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(10) }),
    }),
    channel11: c.channel("channel11.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(11), id: z.string() }),
        updated: z.object({ channel: z.literal(11), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(11), id: z.string() }),
        typing: z.object({ channel: z.literal(11), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(11) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(11) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(11) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(11) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(11) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(11) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(11) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(11) }),
    }),
    channel12: c.channel("channel12.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(12), id: z.string() }),
        updated: z.object({ channel: z.literal(12), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(12), id: z.string() }),
        typing: z.object({ channel: z.literal(12), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(12) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(12) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(12) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(12) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(12) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(12) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(12) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(12) }),
    }),
    channel13: c.channel("channel13.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(13), id: z.string() }),
        updated: z.object({ channel: z.literal(13), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(13), id: z.string() }),
        typing: z.object({ channel: z.literal(13), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(13) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(13) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(13) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(13) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(13) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(13) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(13) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(13) }),
    }),
    channel14: c.channel("channel14.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(14), id: z.string() }),
        updated: z.object({ channel: z.literal(14), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(14), id: z.string() }),
        typing: z.object({ channel: z.literal(14), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(14) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(14) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(14) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(14) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(14) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(14) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(14) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(14) }),
    }),
    channel15: c.channel("channel15.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(15), id: z.string() }),
        updated: z.object({ channel: z.literal(15), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(15), id: z.string() }),
        typing: z.object({ channel: z.literal(15), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(15) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(15) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(15) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(15) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(15) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(15) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(15) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(15) }),
    }),
    channel16: c.channel("channel16.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(16), id: z.string() }),
        updated: z.object({ channel: z.literal(16), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(16), id: z.string() }),
        typing: z.object({ channel: z.literal(16), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(16) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(16) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(16) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(16) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(16) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(16) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(16) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(16) }),
    }),
    channel17: c.channel("channel17.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(17), id: z.string() }),
        updated: z.object({ channel: z.literal(17), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(17), id: z.string() }),
        typing: z.object({ channel: z.literal(17), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(17) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(17) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(17) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(17) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(17) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(17) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(17) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(17) }),
    }),
    channel18: c.channel("channel18.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(18), id: z.string() }),
        updated: z.object({ channel: z.literal(18), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(18), id: z.string() }),
        typing: z.object({ channel: z.literal(18), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(18) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(18) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(18) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(18) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(18) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(18) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(18) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(18) }),
    }),
    channel19: c.channel("channel19.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(19), id: z.string() }),
        updated: z.object({ channel: z.literal(19), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(19), id: z.string() }),
        typing: z.object({ channel: z.literal(19), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(19) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(19) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(19) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(19) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(19) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(19) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(19) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(19) }),
    }),
    channel20: c.channel("channel20.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(20), id: z.string() }),
        updated: z.object({ channel: z.literal(20), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(20), id: z.string() }),
        typing: z.object({ channel: z.literal(20), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(20) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(20) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(20) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(20) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(20) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(20) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(20) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(20) }),
    }),
    channel21: c.channel("channel21.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(21), id: z.string() }),
        updated: z.object({ channel: z.literal(21), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(21), id: z.string() }),
        typing: z.object({ channel: z.literal(21), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(21) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(21) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(21) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(21) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(21) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(21) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(21) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(21) }),
    }),
    channel22: c.channel("channel22.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(22), id: z.string() }),
        updated: z.object({ channel: z.literal(22), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(22), id: z.string() }),
        typing: z.object({ channel: z.literal(22), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(22) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(22) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(22) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(22) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(22) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(22) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(22) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(22) }),
    }),
    channel23: c.channel("channel23.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(23), id: z.string() }),
        updated: z.object({ channel: z.literal(23), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(23), id: z.string() }),
        typing: z.object({ channel: z.literal(23), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(23) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(23) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(23) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(23) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(23) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(23) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(23) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(23) }),
    }),
    channel24: c.channel("channel24.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(24), id: z.string() }),
        updated: z.object({ channel: z.literal(24), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(24), id: z.string() }),
        typing: z.object({ channel: z.literal(24), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(24) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(24) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(24) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(24) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(24) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(24) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(24) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(24) }),
    }),
    channel25: c.channel("channel25.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(25), id: z.string() }),
        updated: z.object({ channel: z.literal(25), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(25), id: z.string() }),
        typing: z.object({ channel: z.literal(25), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(25) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(25) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(25) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(25) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(25) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(25) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(25) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(25) }),
    }),
    channel26: c.channel("channel26.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(26), id: z.string() }),
        updated: z.object({ channel: z.literal(26), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(26), id: z.string() }),
        typing: z.object({ channel: z.literal(26), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(26) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(26) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(26) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(26) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(26) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(26) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(26) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(26) }),
    }),
    channel27: c.channel("channel27.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(27), id: z.string() }),
        updated: z.object({ channel: z.literal(27), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(27), id: z.string() }),
        typing: z.object({ channel: z.literal(27), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(27) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(27) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(27) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(27) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(27) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(27) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(27) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(27) }),
    }),
    channel28: c.channel("channel28.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(28), id: z.string() }),
        updated: z.object({ channel: z.literal(28), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(28), id: z.string() }),
        typing: z.object({ channel: z.literal(28), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(28) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(28) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(28) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(28) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(28) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(28) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(28) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(28) }),
    }),
    channel29: c.channel("channel29.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(29), id: z.string() }),
        updated: z.object({ channel: z.literal(29), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(29), id: z.string() }),
        typing: z.object({ channel: z.literal(29), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(29) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(29) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(29) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(29) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(29) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(29) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(29) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(29) }),
    }),
    channel30: c.channel("channel30.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(30), id: z.string() }),
        updated: z.object({ channel: z.literal(30), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(30), id: z.string() }),
        typing: z.object({ channel: z.literal(30), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(30) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(30) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(30) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(30) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(30) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(30) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(30) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(30) }),
    }),
    channel31: c.channel("channel31.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(31), id: z.string() }),
        updated: z.object({ channel: z.literal(31), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(31), id: z.string() }),
        typing: z.object({ channel: z.literal(31), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(31) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(31) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(31) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(31) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(31) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(31) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(31) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(31) }),
    }),
    channel32: c.channel("channel32.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(32), id: z.string() }),
        updated: z.object({ channel: z.literal(32), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(32), id: z.string() }),
        typing: z.object({ channel: z.literal(32), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(32) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(32) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(32) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(32) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(32) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(32) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(32) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(32) }),
    }),
    channel33: c.channel("channel33.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(33), id: z.string() }),
        updated: z.object({ channel: z.literal(33), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(33), id: z.string() }),
        typing: z.object({ channel: z.literal(33), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(33) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(33) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(33) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(33) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(33) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(33) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(33) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(33) }),
    }),
    channel34: c.channel("channel34.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(34), id: z.string() }),
        updated: z.object({ channel: z.literal(34), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(34), id: z.string() }),
        typing: z.object({ channel: z.literal(34), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(34) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(34) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(34) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(34) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(34) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(34) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(34) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(34) }),
    }),
    channel35: c.channel("channel35.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(35), id: z.string() }),
        updated: z.object({ channel: z.literal(35), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(35), id: z.string() }),
        typing: z.object({ channel: z.literal(35), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(35) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(35) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(35) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(35) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(35) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(35) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(35) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(35) }),
    }),
    channel36: c.channel("channel36.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(36), id: z.string() }),
        updated: z.object({ channel: z.literal(36), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(36), id: z.string() }),
        typing: z.object({ channel: z.literal(36), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(36) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(36) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(36) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(36) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(36) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(36) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(36) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(36) }),
    }),
    channel37: c.channel("channel37.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(37), id: z.string() }),
        updated: z.object({ channel: z.literal(37), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(37), id: z.string() }),
        typing: z.object({ channel: z.literal(37), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(37) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(37) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(37) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(37) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(37) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(37) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(37) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(37) }),
    }),
    channel38: c.channel("channel38.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(38), id: z.string() }),
        updated: z.object({ channel: z.literal(38), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(38), id: z.string() }),
        typing: z.object({ channel: z.literal(38), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(38) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(38) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(38) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(38) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(38) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(38) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(38) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(38) }),
    }),
    channel39: c.channel("channel39.{roomId}", {
      server: {
        created: z.object({ channel: z.literal(39), id: z.string() }),
        updated: z.object({ channel: z.literal(39), version: z.number().int() }),
        deleted: z.object({ channel: z.literal(39), id: z.string() }),
        typing: z.object({ channel: z.literal(39), userId: z.string() }),
      },
      client: {
        send: {
          input: z.object({ text: z.string(), nonce: z.literal(39) }),
          errors: { MUTED: mutedError },
        },
        edit: {
          input: z.object({ id: z.string(), text: z.string(), nonce: z.literal(39) }),
          errors: { CONFLICT: conflictError },
        },
        remove: {
          input: z.object({ id: z.string(), nonce: z.literal(39) }),
          errors: { FORBIDDEN: channelForbiddenError },
        },
      },
      procedures: {
        load: c.query({
          input: z.object({ cursor: z.number().int().optional(), channel: z.literal(39) }),
          output: z.object({ items: z.array(z.string()), channel: z.literal(39) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
        moderate: c.mutation({
          input: z.object({ userId: z.string(), channel: z.literal(39) }),
          output: z.object({ removed: z.boolean(), channel: z.literal(39) }),
          errors: { FORBIDDEN: channelForbiddenError },
        }),
      },
      presence: z.object({ typing: z.boolean(), channel: z.literal(39) }),
    }),
  },
});

export type Api = typeof api;

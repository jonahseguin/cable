import { createClient } from "@cable/client";
import type { ChannelStatus, Link, PresenceMember } from "@cable/client";
import type {
  InferChannelParams,
  InferClientEventErrors,
  InferErrors,
  InferInput,
  InferOutput,
  InferPresence,
  InferServerEvent,
} from "@cable/contract";

import { api, type Api } from "./contract.js";

const memoryLink: Link = () => async (call) => ({ id: call.id, ok: true, data: undefined });
const client = createClient<Api>({ contract: api, links: [memoryLink] });

const input0: InferInput<typeof api.group0.section0.procedure0> = {
  id: "item-0",
  cursor: 0,
  marker: 0,
};
const call0: Promise<InferOutput<typeof api.group0.section0.procedure0>> =
  client.group0.section0.procedure0.query(input0);
const error0: InferErrors<typeof api.group0.section0.procedure0> = {
  code: "FORBIDDEN",
  data: { resource: "procedure0" },
};

const input1: InferInput<typeof api.group0.section0.procedure1> = {
  id: "item-1",
  cursor: 1,
  marker: 1,
};
const call1: Promise<InferOutput<typeof api.group0.section0.procedure1>> =
  client.group0.section0.procedure1.mutate(input1);
const error1: InferErrors<typeof api.group0.section0.procedure1> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 2 },
};

const input2: InferInput<typeof api.group0.section0.procedure2> = {
  id: "item-2",
  cursor: 2,
  marker: 2,
};
const call2: Promise<InferOutput<typeof api.group0.section0.procedure2>> =
  client.group0.section0.procedure2.query(input2);
const error2: InferErrors<typeof api.group0.section0.procedure2> = {
  code: "FORBIDDEN",
  data: { resource: "procedure2" },
};

const input3: InferInput<typeof api.group0.section0.procedure3> = {
  id: "item-3",
  cursor: 3,
  marker: 3,
};
const call3: Promise<InferOutput<typeof api.group0.section0.procedure3>> =
  client.group0.section0.procedure3.mutate(input3);
const error3: InferErrors<typeof api.group0.section0.procedure3> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 4 },
};

const input4: InferInput<typeof api.group0.section0.procedure4> = {
  id: "item-4",
  cursor: 4,
  marker: 4,
};
const call4: Promise<InferOutput<typeof api.group0.section0.procedure4>> =
  client.group0.section0.procedure4.query(input4);
const error4: InferErrors<typeof api.group0.section0.procedure4> = {
  code: "FORBIDDEN",
  data: { resource: "procedure4" },
};

const input5: InferInput<typeof api.group0.section0.procedure5> = {
  id: "item-5",
  cursor: 5,
  marker: 5,
};
const call5: Promise<InferOutput<typeof api.group0.section0.procedure5>> =
  client.group0.section0.procedure5.mutate(input5);
const error5: InferErrors<typeof api.group0.section0.procedure5> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 6 },
};

const input6: InferInput<typeof api.group0.section0.procedure6> = {
  id: "item-6",
  cursor: 6,
  marker: 6,
};
const call6: Promise<InferOutput<typeof api.group0.section0.procedure6>> =
  client.group0.section0.procedure6.query(input6);
const error6: InferErrors<typeof api.group0.section0.procedure6> = {
  code: "FORBIDDEN",
  data: { resource: "procedure6" },
};

const input7: InferInput<typeof api.group0.section0.procedure7> = {
  id: "item-7",
  cursor: 7,
  marker: 7,
};
const call7: Promise<InferOutput<typeof api.group0.section0.procedure7>> =
  client.group0.section0.procedure7.mutate(input7);
const error7: InferErrors<typeof api.group0.section0.procedure7> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 8 },
};

const input8: InferInput<typeof api.group0.section0.procedure8> = {
  id: "item-8",
  cursor: 8,
  marker: 8,
};
const call8: Promise<InferOutput<typeof api.group0.section0.procedure8>> =
  client.group0.section0.procedure8.query(input8);
const error8: InferErrors<typeof api.group0.section0.procedure8> = {
  code: "FORBIDDEN",
  data: { resource: "procedure8" },
};

const input9: InferInput<typeof api.group0.section0.procedure9> = {
  id: "item-9",
  cursor: 9,
  marker: 9,
};
const call9: Promise<InferOutput<typeof api.group0.section0.procedure9>> =
  client.group0.section0.procedure9.mutate(input9);
const error9: InferErrors<typeof api.group0.section0.procedure9> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 10 },
};

const input10: InferInput<typeof api.group0.section1.procedure10> = {
  id: "item-10",
  cursor: 10,
  marker: 10,
};
const call10: Promise<InferOutput<typeof api.group0.section1.procedure10>> =
  client.group0.section1.procedure10.query(input10);
const error10: InferErrors<typeof api.group0.section1.procedure10> = {
  code: "FORBIDDEN",
  data: { resource: "procedure10" },
};

const input11: InferInput<typeof api.group0.section1.procedure11> = {
  id: "item-11",
  cursor: 11,
  marker: 11,
};
const call11: Promise<InferOutput<typeof api.group0.section1.procedure11>> =
  client.group0.section1.procedure11.mutate(input11);
const error11: InferErrors<typeof api.group0.section1.procedure11> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 12 },
};

const input12: InferInput<typeof api.group0.section1.procedure12> = {
  id: "item-12",
  cursor: 12,
  marker: 12,
};
const call12: Promise<InferOutput<typeof api.group0.section1.procedure12>> =
  client.group0.section1.procedure12.query(input12);
const error12: InferErrors<typeof api.group0.section1.procedure12> = {
  code: "FORBIDDEN",
  data: { resource: "procedure12" },
};

const input13: InferInput<typeof api.group0.section1.procedure13> = {
  id: "item-13",
  cursor: 13,
  marker: 13,
};
const call13: Promise<InferOutput<typeof api.group0.section1.procedure13>> =
  client.group0.section1.procedure13.mutate(input13);
const error13: InferErrors<typeof api.group0.section1.procedure13> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 14 },
};

const input14: InferInput<typeof api.group0.section1.procedure14> = {
  id: "item-14",
  cursor: 14,
  marker: 14,
};
const call14: Promise<InferOutput<typeof api.group0.section1.procedure14>> =
  client.group0.section1.procedure14.query(input14);
const error14: InferErrors<typeof api.group0.section1.procedure14> = {
  code: "FORBIDDEN",
  data: { resource: "procedure14" },
};

const input15: InferInput<typeof api.group0.section1.procedure15> = {
  id: "item-15",
  cursor: 15,
  marker: 15,
};
const call15: Promise<InferOutput<typeof api.group0.section1.procedure15>> =
  client.group0.section1.procedure15.mutate(input15);
const error15: InferErrors<typeof api.group0.section1.procedure15> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 16 },
};

const input16: InferInput<typeof api.group0.section1.procedure16> = {
  id: "item-16",
  cursor: 16,
  marker: 16,
};
const call16: Promise<InferOutput<typeof api.group0.section1.procedure16>> =
  client.group0.section1.procedure16.query(input16);
const error16: InferErrors<typeof api.group0.section1.procedure16> = {
  code: "FORBIDDEN",
  data: { resource: "procedure16" },
};

const input17: InferInput<typeof api.group0.section1.procedure17> = {
  id: "item-17",
  cursor: 17,
  marker: 17,
};
const call17: Promise<InferOutput<typeof api.group0.section1.procedure17>> =
  client.group0.section1.procedure17.mutate(input17);
const error17: InferErrors<typeof api.group0.section1.procedure17> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 18 },
};

const input18: InferInput<typeof api.group0.section1.procedure18> = {
  id: "item-18",
  cursor: 18,
  marker: 18,
};
const call18: Promise<InferOutput<typeof api.group0.section1.procedure18>> =
  client.group0.section1.procedure18.query(input18);
const error18: InferErrors<typeof api.group0.section1.procedure18> = {
  code: "FORBIDDEN",
  data: { resource: "procedure18" },
};

const input19: InferInput<typeof api.group0.section1.procedure19> = {
  id: "item-19",
  cursor: 19,
  marker: 19,
};
const call19: Promise<InferOutput<typeof api.group0.section1.procedure19>> =
  client.group0.section1.procedure19.mutate(input19);
const error19: InferErrors<typeof api.group0.section1.procedure19> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 20 },
};

const input20: InferInput<typeof api.group0.section2.procedure20> = {
  id: "item-20",
  cursor: 20,
  marker: 20,
};
const call20: Promise<InferOutput<typeof api.group0.section2.procedure20>> =
  client.group0.section2.procedure20.query(input20);
const error20: InferErrors<typeof api.group0.section2.procedure20> = {
  code: "FORBIDDEN",
  data: { resource: "procedure20" },
};

const input21: InferInput<typeof api.group0.section2.procedure21> = {
  id: "item-21",
  cursor: 21,
  marker: 21,
};
const call21: Promise<InferOutput<typeof api.group0.section2.procedure21>> =
  client.group0.section2.procedure21.mutate(input21);
const error21: InferErrors<typeof api.group0.section2.procedure21> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 22 },
};

const input22: InferInput<typeof api.group0.section2.procedure22> = {
  id: "item-22",
  cursor: 22,
  marker: 22,
};
const call22: Promise<InferOutput<typeof api.group0.section2.procedure22>> =
  client.group0.section2.procedure22.query(input22);
const error22: InferErrors<typeof api.group0.section2.procedure22> = {
  code: "FORBIDDEN",
  data: { resource: "procedure22" },
};

const input23: InferInput<typeof api.group0.section2.procedure23> = {
  id: "item-23",
  cursor: 23,
  marker: 23,
};
const call23: Promise<InferOutput<typeof api.group0.section2.procedure23>> =
  client.group0.section2.procedure23.mutate(input23);
const error23: InferErrors<typeof api.group0.section2.procedure23> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 24 },
};

const input24: InferInput<typeof api.group0.section2.procedure24> = {
  id: "item-24",
  cursor: 24,
  marker: 24,
};
const call24: Promise<InferOutput<typeof api.group0.section2.procedure24>> =
  client.group0.section2.procedure24.query(input24);
const error24: InferErrors<typeof api.group0.section2.procedure24> = {
  code: "FORBIDDEN",
  data: { resource: "procedure24" },
};

const input25: InferInput<typeof api.group0.section2.procedure25> = {
  id: "item-25",
  cursor: 25,
  marker: 25,
};
const call25: Promise<InferOutput<typeof api.group0.section2.procedure25>> =
  client.group0.section2.procedure25.mutate(input25);
const error25: InferErrors<typeof api.group0.section2.procedure25> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 26 },
};

const input26: InferInput<typeof api.group0.section2.procedure26> = {
  id: "item-26",
  cursor: 26,
  marker: 26,
};
const call26: Promise<InferOutput<typeof api.group0.section2.procedure26>> =
  client.group0.section2.procedure26.query(input26);
const error26: InferErrors<typeof api.group0.section2.procedure26> = {
  code: "FORBIDDEN",
  data: { resource: "procedure26" },
};

const input27: InferInput<typeof api.group0.section2.procedure27> = {
  id: "item-27",
  cursor: 27,
  marker: 27,
};
const call27: Promise<InferOutput<typeof api.group0.section2.procedure27>> =
  client.group0.section2.procedure27.mutate(input27);
const error27: InferErrors<typeof api.group0.section2.procedure27> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 28 },
};

const input28: InferInput<typeof api.group0.section2.procedure28> = {
  id: "item-28",
  cursor: 28,
  marker: 28,
};
const call28: Promise<InferOutput<typeof api.group0.section2.procedure28>> =
  client.group0.section2.procedure28.query(input28);
const error28: InferErrors<typeof api.group0.section2.procedure28> = {
  code: "FORBIDDEN",
  data: { resource: "procedure28" },
};

const input29: InferInput<typeof api.group0.section2.procedure29> = {
  id: "item-29",
  cursor: 29,
  marker: 29,
};
const call29: Promise<InferOutput<typeof api.group0.section2.procedure29>> =
  client.group0.section2.procedure29.mutate(input29);
const error29: InferErrors<typeof api.group0.section2.procedure29> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 30 },
};

const input30: InferInput<typeof api.group0.section3.procedure30> = {
  id: "item-30",
  cursor: 30,
  marker: 30,
};
const call30: Promise<InferOutput<typeof api.group0.section3.procedure30>> =
  client.group0.section3.procedure30.query(input30);
const error30: InferErrors<typeof api.group0.section3.procedure30> = {
  code: "FORBIDDEN",
  data: { resource: "procedure30" },
};

const input31: InferInput<typeof api.group0.section3.procedure31> = {
  id: "item-31",
  cursor: 31,
  marker: 31,
};
const call31: Promise<InferOutput<typeof api.group0.section3.procedure31>> =
  client.group0.section3.procedure31.mutate(input31);
const error31: InferErrors<typeof api.group0.section3.procedure31> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 32 },
};

const input32: InferInput<typeof api.group0.section3.procedure32> = {
  id: "item-32",
  cursor: 32,
  marker: 32,
};
const call32: Promise<InferOutput<typeof api.group0.section3.procedure32>> =
  client.group0.section3.procedure32.query(input32);
const error32: InferErrors<typeof api.group0.section3.procedure32> = {
  code: "FORBIDDEN",
  data: { resource: "procedure32" },
};

const input33: InferInput<typeof api.group0.section3.procedure33> = {
  id: "item-33",
  cursor: 33,
  marker: 33,
};
const call33: Promise<InferOutput<typeof api.group0.section3.procedure33>> =
  client.group0.section3.procedure33.mutate(input33);
const error33: InferErrors<typeof api.group0.section3.procedure33> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 34 },
};

const input34: InferInput<typeof api.group0.section3.procedure34> = {
  id: "item-34",
  cursor: 34,
  marker: 34,
};
const call34: Promise<InferOutput<typeof api.group0.section3.procedure34>> =
  client.group0.section3.procedure34.query(input34);
const error34: InferErrors<typeof api.group0.section3.procedure34> = {
  code: "FORBIDDEN",
  data: { resource: "procedure34" },
};

const input35: InferInput<typeof api.group0.section3.procedure35> = {
  id: "item-35",
  cursor: 35,
  marker: 35,
};
const call35: Promise<InferOutput<typeof api.group0.section3.procedure35>> =
  client.group0.section3.procedure35.mutate(input35);
const error35: InferErrors<typeof api.group0.section3.procedure35> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 36 },
};

const input36: InferInput<typeof api.group0.section3.procedure36> = {
  id: "item-36",
  cursor: 36,
  marker: 36,
};
const call36: Promise<InferOutput<typeof api.group0.section3.procedure36>> =
  client.group0.section3.procedure36.query(input36);
const error36: InferErrors<typeof api.group0.section3.procedure36> = {
  code: "FORBIDDEN",
  data: { resource: "procedure36" },
};

const input37: InferInput<typeof api.group0.section3.procedure37> = {
  id: "item-37",
  cursor: 37,
  marker: 37,
};
const call37: Promise<InferOutput<typeof api.group0.section3.procedure37>> =
  client.group0.section3.procedure37.mutate(input37);
const error37: InferErrors<typeof api.group0.section3.procedure37> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 38 },
};

const input38: InferInput<typeof api.group0.section3.procedure38> = {
  id: "item-38",
  cursor: 38,
  marker: 38,
};
const call38: Promise<InferOutput<typeof api.group0.section3.procedure38>> =
  client.group0.section3.procedure38.query(input38);
const error38: InferErrors<typeof api.group0.section3.procedure38> = {
  code: "FORBIDDEN",
  data: { resource: "procedure38" },
};

const input39: InferInput<typeof api.group0.section3.procedure39> = {
  id: "item-39",
  cursor: 39,
  marker: 39,
};
const call39: Promise<InferOutput<typeof api.group0.section3.procedure39>> =
  client.group0.section3.procedure39.mutate(input39);
const error39: InferErrors<typeof api.group0.section3.procedure39> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 40 },
};

const input40: InferInput<typeof api.group1.section0.procedure40> = {
  id: "item-40",
  cursor: 40,
  marker: 40,
};
const call40: Promise<InferOutput<typeof api.group1.section0.procedure40>> =
  client.group1.section0.procedure40.query(input40);
const error40: InferErrors<typeof api.group1.section0.procedure40> = {
  code: "FORBIDDEN",
  data: { resource: "procedure40" },
};

const input41: InferInput<typeof api.group1.section0.procedure41> = {
  id: "item-41",
  cursor: 41,
  marker: 41,
};
const call41: Promise<InferOutput<typeof api.group1.section0.procedure41>> =
  client.group1.section0.procedure41.mutate(input41);
const error41: InferErrors<typeof api.group1.section0.procedure41> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 42 },
};

const input42: InferInput<typeof api.group1.section0.procedure42> = {
  id: "item-42",
  cursor: 42,
  marker: 42,
};
const call42: Promise<InferOutput<typeof api.group1.section0.procedure42>> =
  client.group1.section0.procedure42.query(input42);
const error42: InferErrors<typeof api.group1.section0.procedure42> = {
  code: "FORBIDDEN",
  data: { resource: "procedure42" },
};

const input43: InferInput<typeof api.group1.section0.procedure43> = {
  id: "item-43",
  cursor: 43,
  marker: 43,
};
const call43: Promise<InferOutput<typeof api.group1.section0.procedure43>> =
  client.group1.section0.procedure43.mutate(input43);
const error43: InferErrors<typeof api.group1.section0.procedure43> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 44 },
};

const input44: InferInput<typeof api.group1.section0.procedure44> = {
  id: "item-44",
  cursor: 44,
  marker: 44,
};
const call44: Promise<InferOutput<typeof api.group1.section0.procedure44>> =
  client.group1.section0.procedure44.query(input44);
const error44: InferErrors<typeof api.group1.section0.procedure44> = {
  code: "FORBIDDEN",
  data: { resource: "procedure44" },
};

const input45: InferInput<typeof api.group1.section0.procedure45> = {
  id: "item-45",
  cursor: 45,
  marker: 45,
};
const call45: Promise<InferOutput<typeof api.group1.section0.procedure45>> =
  client.group1.section0.procedure45.mutate(input45);
const error45: InferErrors<typeof api.group1.section0.procedure45> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 46 },
};

const input46: InferInput<typeof api.group1.section0.procedure46> = {
  id: "item-46",
  cursor: 46,
  marker: 46,
};
const call46: Promise<InferOutput<typeof api.group1.section0.procedure46>> =
  client.group1.section0.procedure46.query(input46);
const error46: InferErrors<typeof api.group1.section0.procedure46> = {
  code: "FORBIDDEN",
  data: { resource: "procedure46" },
};

const input47: InferInput<typeof api.group1.section0.procedure47> = {
  id: "item-47",
  cursor: 47,
  marker: 47,
};
const call47: Promise<InferOutput<typeof api.group1.section0.procedure47>> =
  client.group1.section0.procedure47.mutate(input47);
const error47: InferErrors<typeof api.group1.section0.procedure47> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 48 },
};

const input48: InferInput<typeof api.group1.section0.procedure48> = {
  id: "item-48",
  cursor: 48,
  marker: 48,
};
const call48: Promise<InferOutput<typeof api.group1.section0.procedure48>> =
  client.group1.section0.procedure48.query(input48);
const error48: InferErrors<typeof api.group1.section0.procedure48> = {
  code: "FORBIDDEN",
  data: { resource: "procedure48" },
};

const input49: InferInput<typeof api.group1.section0.procedure49> = {
  id: "item-49",
  cursor: 49,
  marker: 49,
};
const call49: Promise<InferOutput<typeof api.group1.section0.procedure49>> =
  client.group1.section0.procedure49.mutate(input49);
const error49: InferErrors<typeof api.group1.section0.procedure49> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 50 },
};

const input50: InferInput<typeof api.group1.section1.procedure50> = {
  id: "item-50",
  cursor: 50,
  marker: 50,
};
const call50: Promise<InferOutput<typeof api.group1.section1.procedure50>> =
  client.group1.section1.procedure50.query(input50);
const error50: InferErrors<typeof api.group1.section1.procedure50> = {
  code: "FORBIDDEN",
  data: { resource: "procedure50" },
};

const input51: InferInput<typeof api.group1.section1.procedure51> = {
  id: "item-51",
  cursor: 51,
  marker: 51,
};
const call51: Promise<InferOutput<typeof api.group1.section1.procedure51>> =
  client.group1.section1.procedure51.mutate(input51);
const error51: InferErrors<typeof api.group1.section1.procedure51> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 52 },
};

const input52: InferInput<typeof api.group1.section1.procedure52> = {
  id: "item-52",
  cursor: 52,
  marker: 52,
};
const call52: Promise<InferOutput<typeof api.group1.section1.procedure52>> =
  client.group1.section1.procedure52.query(input52);
const error52: InferErrors<typeof api.group1.section1.procedure52> = {
  code: "FORBIDDEN",
  data: { resource: "procedure52" },
};

const input53: InferInput<typeof api.group1.section1.procedure53> = {
  id: "item-53",
  cursor: 53,
  marker: 53,
};
const call53: Promise<InferOutput<typeof api.group1.section1.procedure53>> =
  client.group1.section1.procedure53.mutate(input53);
const error53: InferErrors<typeof api.group1.section1.procedure53> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 54 },
};

const input54: InferInput<typeof api.group1.section1.procedure54> = {
  id: "item-54",
  cursor: 54,
  marker: 54,
};
const call54: Promise<InferOutput<typeof api.group1.section1.procedure54>> =
  client.group1.section1.procedure54.query(input54);
const error54: InferErrors<typeof api.group1.section1.procedure54> = {
  code: "FORBIDDEN",
  data: { resource: "procedure54" },
};

const input55: InferInput<typeof api.group1.section1.procedure55> = {
  id: "item-55",
  cursor: 55,
  marker: 55,
};
const call55: Promise<InferOutput<typeof api.group1.section1.procedure55>> =
  client.group1.section1.procedure55.mutate(input55);
const error55: InferErrors<typeof api.group1.section1.procedure55> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 56 },
};

const input56: InferInput<typeof api.group1.section1.procedure56> = {
  id: "item-56",
  cursor: 56,
  marker: 56,
};
const call56: Promise<InferOutput<typeof api.group1.section1.procedure56>> =
  client.group1.section1.procedure56.query(input56);
const error56: InferErrors<typeof api.group1.section1.procedure56> = {
  code: "FORBIDDEN",
  data: { resource: "procedure56" },
};

const input57: InferInput<typeof api.group1.section1.procedure57> = {
  id: "item-57",
  cursor: 57,
  marker: 57,
};
const call57: Promise<InferOutput<typeof api.group1.section1.procedure57>> =
  client.group1.section1.procedure57.mutate(input57);
const error57: InferErrors<typeof api.group1.section1.procedure57> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 58 },
};

const input58: InferInput<typeof api.group1.section1.procedure58> = {
  id: "item-58",
  cursor: 58,
  marker: 58,
};
const call58: Promise<InferOutput<typeof api.group1.section1.procedure58>> =
  client.group1.section1.procedure58.query(input58);
const error58: InferErrors<typeof api.group1.section1.procedure58> = {
  code: "FORBIDDEN",
  data: { resource: "procedure58" },
};

const input59: InferInput<typeof api.group1.section1.procedure59> = {
  id: "item-59",
  cursor: 59,
  marker: 59,
};
const call59: Promise<InferOutput<typeof api.group1.section1.procedure59>> =
  client.group1.section1.procedure59.mutate(input59);
const error59: InferErrors<typeof api.group1.section1.procedure59> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 60 },
};

const input60: InferInput<typeof api.group1.section2.procedure60> = {
  id: "item-60",
  cursor: 60,
  marker: 60,
};
const call60: Promise<InferOutput<typeof api.group1.section2.procedure60>> =
  client.group1.section2.procedure60.query(input60);
const error60: InferErrors<typeof api.group1.section2.procedure60> = {
  code: "FORBIDDEN",
  data: { resource: "procedure60" },
};

const input61: InferInput<typeof api.group1.section2.procedure61> = {
  id: "item-61",
  cursor: 61,
  marker: 61,
};
const call61: Promise<InferOutput<typeof api.group1.section2.procedure61>> =
  client.group1.section2.procedure61.mutate(input61);
const error61: InferErrors<typeof api.group1.section2.procedure61> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 62 },
};

const input62: InferInput<typeof api.group1.section2.procedure62> = {
  id: "item-62",
  cursor: 62,
  marker: 62,
};
const call62: Promise<InferOutput<typeof api.group1.section2.procedure62>> =
  client.group1.section2.procedure62.query(input62);
const error62: InferErrors<typeof api.group1.section2.procedure62> = {
  code: "FORBIDDEN",
  data: { resource: "procedure62" },
};

const input63: InferInput<typeof api.group1.section2.procedure63> = {
  id: "item-63",
  cursor: 63,
  marker: 63,
};
const call63: Promise<InferOutput<typeof api.group1.section2.procedure63>> =
  client.group1.section2.procedure63.mutate(input63);
const error63: InferErrors<typeof api.group1.section2.procedure63> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 64 },
};

const input64: InferInput<typeof api.group1.section2.procedure64> = {
  id: "item-64",
  cursor: 64,
  marker: 64,
};
const call64: Promise<InferOutput<typeof api.group1.section2.procedure64>> =
  client.group1.section2.procedure64.query(input64);
const error64: InferErrors<typeof api.group1.section2.procedure64> = {
  code: "FORBIDDEN",
  data: { resource: "procedure64" },
};

const input65: InferInput<typeof api.group1.section2.procedure65> = {
  id: "item-65",
  cursor: 65,
  marker: 65,
};
const call65: Promise<InferOutput<typeof api.group1.section2.procedure65>> =
  client.group1.section2.procedure65.mutate(input65);
const error65: InferErrors<typeof api.group1.section2.procedure65> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 66 },
};

const input66: InferInput<typeof api.group1.section2.procedure66> = {
  id: "item-66",
  cursor: 66,
  marker: 66,
};
const call66: Promise<InferOutput<typeof api.group1.section2.procedure66>> =
  client.group1.section2.procedure66.query(input66);
const error66: InferErrors<typeof api.group1.section2.procedure66> = {
  code: "FORBIDDEN",
  data: { resource: "procedure66" },
};

const input67: InferInput<typeof api.group1.section2.procedure67> = {
  id: "item-67",
  cursor: 67,
  marker: 67,
};
const call67: Promise<InferOutput<typeof api.group1.section2.procedure67>> =
  client.group1.section2.procedure67.mutate(input67);
const error67: InferErrors<typeof api.group1.section2.procedure67> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 68 },
};

const input68: InferInput<typeof api.group1.section2.procedure68> = {
  id: "item-68",
  cursor: 68,
  marker: 68,
};
const call68: Promise<InferOutput<typeof api.group1.section2.procedure68>> =
  client.group1.section2.procedure68.query(input68);
const error68: InferErrors<typeof api.group1.section2.procedure68> = {
  code: "FORBIDDEN",
  data: { resource: "procedure68" },
};

const input69: InferInput<typeof api.group1.section2.procedure69> = {
  id: "item-69",
  cursor: 69,
  marker: 69,
};
const call69: Promise<InferOutput<typeof api.group1.section2.procedure69>> =
  client.group1.section2.procedure69.mutate(input69);
const error69: InferErrors<typeof api.group1.section2.procedure69> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 70 },
};

const input70: InferInput<typeof api.group1.section3.procedure70> = {
  id: "item-70",
  cursor: 70,
  marker: 70,
};
const call70: Promise<InferOutput<typeof api.group1.section3.procedure70>> =
  client.group1.section3.procedure70.query(input70);
const error70: InferErrors<typeof api.group1.section3.procedure70> = {
  code: "FORBIDDEN",
  data: { resource: "procedure70" },
};

const input71: InferInput<typeof api.group1.section3.procedure71> = {
  id: "item-71",
  cursor: 71,
  marker: 71,
};
const call71: Promise<InferOutput<typeof api.group1.section3.procedure71>> =
  client.group1.section3.procedure71.mutate(input71);
const error71: InferErrors<typeof api.group1.section3.procedure71> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 72 },
};

const input72: InferInput<typeof api.group1.section3.procedure72> = {
  id: "item-72",
  cursor: 72,
  marker: 72,
};
const call72: Promise<InferOutput<typeof api.group1.section3.procedure72>> =
  client.group1.section3.procedure72.query(input72);
const error72: InferErrors<typeof api.group1.section3.procedure72> = {
  code: "FORBIDDEN",
  data: { resource: "procedure72" },
};

const input73: InferInput<typeof api.group1.section3.procedure73> = {
  id: "item-73",
  cursor: 73,
  marker: 73,
};
const call73: Promise<InferOutput<typeof api.group1.section3.procedure73>> =
  client.group1.section3.procedure73.mutate(input73);
const error73: InferErrors<typeof api.group1.section3.procedure73> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 74 },
};

const input74: InferInput<typeof api.group1.section3.procedure74> = {
  id: "item-74",
  cursor: 74,
  marker: 74,
};
const call74: Promise<InferOutput<typeof api.group1.section3.procedure74>> =
  client.group1.section3.procedure74.query(input74);
const error74: InferErrors<typeof api.group1.section3.procedure74> = {
  code: "FORBIDDEN",
  data: { resource: "procedure74" },
};

const input75: InferInput<typeof api.group1.section3.procedure75> = {
  id: "item-75",
  cursor: 75,
  marker: 75,
};
const call75: Promise<InferOutput<typeof api.group1.section3.procedure75>> =
  client.group1.section3.procedure75.mutate(input75);
const error75: InferErrors<typeof api.group1.section3.procedure75> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 76 },
};

const input76: InferInput<typeof api.group1.section3.procedure76> = {
  id: "item-76",
  cursor: 76,
  marker: 76,
};
const call76: Promise<InferOutput<typeof api.group1.section3.procedure76>> =
  client.group1.section3.procedure76.query(input76);
const error76: InferErrors<typeof api.group1.section3.procedure76> = {
  code: "FORBIDDEN",
  data: { resource: "procedure76" },
};

const input77: InferInput<typeof api.group1.section3.procedure77> = {
  id: "item-77",
  cursor: 77,
  marker: 77,
};
const call77: Promise<InferOutput<typeof api.group1.section3.procedure77>> =
  client.group1.section3.procedure77.mutate(input77);
const error77: InferErrors<typeof api.group1.section3.procedure77> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 78 },
};

const input78: InferInput<typeof api.group1.section3.procedure78> = {
  id: "item-78",
  cursor: 78,
  marker: 78,
};
const call78: Promise<InferOutput<typeof api.group1.section3.procedure78>> =
  client.group1.section3.procedure78.query(input78);
const error78: InferErrors<typeof api.group1.section3.procedure78> = {
  code: "FORBIDDEN",
  data: { resource: "procedure78" },
};

const input79: InferInput<typeof api.group1.section3.procedure79> = {
  id: "item-79",
  cursor: 79,
  marker: 79,
};
const call79: Promise<InferOutput<typeof api.group1.section3.procedure79>> =
  client.group1.section3.procedure79.mutate(input79);
const error79: InferErrors<typeof api.group1.section3.procedure79> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 80 },
};

const input80: InferInput<typeof api.group2.section0.procedure80> = {
  id: "item-80",
  cursor: 80,
  marker: 80,
};
const call80: Promise<InferOutput<typeof api.group2.section0.procedure80>> =
  client.group2.section0.procedure80.query(input80);
const error80: InferErrors<typeof api.group2.section0.procedure80> = {
  code: "FORBIDDEN",
  data: { resource: "procedure80" },
};

const input81: InferInput<typeof api.group2.section0.procedure81> = {
  id: "item-81",
  cursor: 81,
  marker: 81,
};
const call81: Promise<InferOutput<typeof api.group2.section0.procedure81>> =
  client.group2.section0.procedure81.mutate(input81);
const error81: InferErrors<typeof api.group2.section0.procedure81> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 82 },
};

const input82: InferInput<typeof api.group2.section0.procedure82> = {
  id: "item-82",
  cursor: 82,
  marker: 82,
};
const call82: Promise<InferOutput<typeof api.group2.section0.procedure82>> =
  client.group2.section0.procedure82.query(input82);
const error82: InferErrors<typeof api.group2.section0.procedure82> = {
  code: "FORBIDDEN",
  data: { resource: "procedure82" },
};

const input83: InferInput<typeof api.group2.section0.procedure83> = {
  id: "item-83",
  cursor: 83,
  marker: 83,
};
const call83: Promise<InferOutput<typeof api.group2.section0.procedure83>> =
  client.group2.section0.procedure83.mutate(input83);
const error83: InferErrors<typeof api.group2.section0.procedure83> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 84 },
};

const input84: InferInput<typeof api.group2.section0.procedure84> = {
  id: "item-84",
  cursor: 84,
  marker: 84,
};
const call84: Promise<InferOutput<typeof api.group2.section0.procedure84>> =
  client.group2.section0.procedure84.query(input84);
const error84: InferErrors<typeof api.group2.section0.procedure84> = {
  code: "FORBIDDEN",
  data: { resource: "procedure84" },
};

const input85: InferInput<typeof api.group2.section0.procedure85> = {
  id: "item-85",
  cursor: 85,
  marker: 85,
};
const call85: Promise<InferOutput<typeof api.group2.section0.procedure85>> =
  client.group2.section0.procedure85.mutate(input85);
const error85: InferErrors<typeof api.group2.section0.procedure85> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 86 },
};

const input86: InferInput<typeof api.group2.section0.procedure86> = {
  id: "item-86",
  cursor: 86,
  marker: 86,
};
const call86: Promise<InferOutput<typeof api.group2.section0.procedure86>> =
  client.group2.section0.procedure86.query(input86);
const error86: InferErrors<typeof api.group2.section0.procedure86> = {
  code: "FORBIDDEN",
  data: { resource: "procedure86" },
};

const input87: InferInput<typeof api.group2.section0.procedure87> = {
  id: "item-87",
  cursor: 87,
  marker: 87,
};
const call87: Promise<InferOutput<typeof api.group2.section0.procedure87>> =
  client.group2.section0.procedure87.mutate(input87);
const error87: InferErrors<typeof api.group2.section0.procedure87> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 88 },
};

const input88: InferInput<typeof api.group2.section0.procedure88> = {
  id: "item-88",
  cursor: 88,
  marker: 88,
};
const call88: Promise<InferOutput<typeof api.group2.section0.procedure88>> =
  client.group2.section0.procedure88.query(input88);
const error88: InferErrors<typeof api.group2.section0.procedure88> = {
  code: "FORBIDDEN",
  data: { resource: "procedure88" },
};

const input89: InferInput<typeof api.group2.section0.procedure89> = {
  id: "item-89",
  cursor: 89,
  marker: 89,
};
const call89: Promise<InferOutput<typeof api.group2.section0.procedure89>> =
  client.group2.section0.procedure89.mutate(input89);
const error89: InferErrors<typeof api.group2.section0.procedure89> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 90 },
};

const input90: InferInput<typeof api.group2.section1.procedure90> = {
  id: "item-90",
  cursor: 90,
  marker: 90,
};
const call90: Promise<InferOutput<typeof api.group2.section1.procedure90>> =
  client.group2.section1.procedure90.query(input90);
const error90: InferErrors<typeof api.group2.section1.procedure90> = {
  code: "FORBIDDEN",
  data: { resource: "procedure90" },
};

const input91: InferInput<typeof api.group2.section1.procedure91> = {
  id: "item-91",
  cursor: 91,
  marker: 91,
};
const call91: Promise<InferOutput<typeof api.group2.section1.procedure91>> =
  client.group2.section1.procedure91.mutate(input91);
const error91: InferErrors<typeof api.group2.section1.procedure91> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 92 },
};

const input92: InferInput<typeof api.group2.section1.procedure92> = {
  id: "item-92",
  cursor: 92,
  marker: 92,
};
const call92: Promise<InferOutput<typeof api.group2.section1.procedure92>> =
  client.group2.section1.procedure92.query(input92);
const error92: InferErrors<typeof api.group2.section1.procedure92> = {
  code: "FORBIDDEN",
  data: { resource: "procedure92" },
};

const input93: InferInput<typeof api.group2.section1.procedure93> = {
  id: "item-93",
  cursor: 93,
  marker: 93,
};
const call93: Promise<InferOutput<typeof api.group2.section1.procedure93>> =
  client.group2.section1.procedure93.mutate(input93);
const error93: InferErrors<typeof api.group2.section1.procedure93> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 94 },
};

const input94: InferInput<typeof api.group2.section1.procedure94> = {
  id: "item-94",
  cursor: 94,
  marker: 94,
};
const call94: Promise<InferOutput<typeof api.group2.section1.procedure94>> =
  client.group2.section1.procedure94.query(input94);
const error94: InferErrors<typeof api.group2.section1.procedure94> = {
  code: "FORBIDDEN",
  data: { resource: "procedure94" },
};

const input95: InferInput<typeof api.group2.section1.procedure95> = {
  id: "item-95",
  cursor: 95,
  marker: 95,
};
const call95: Promise<InferOutput<typeof api.group2.section1.procedure95>> =
  client.group2.section1.procedure95.mutate(input95);
const error95: InferErrors<typeof api.group2.section1.procedure95> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 96 },
};

const input96: InferInput<typeof api.group2.section1.procedure96> = {
  id: "item-96",
  cursor: 96,
  marker: 96,
};
const call96: Promise<InferOutput<typeof api.group2.section1.procedure96>> =
  client.group2.section1.procedure96.query(input96);
const error96: InferErrors<typeof api.group2.section1.procedure96> = {
  code: "FORBIDDEN",
  data: { resource: "procedure96" },
};

const input97: InferInput<typeof api.group2.section1.procedure97> = {
  id: "item-97",
  cursor: 97,
  marker: 97,
};
const call97: Promise<InferOutput<typeof api.group2.section1.procedure97>> =
  client.group2.section1.procedure97.mutate(input97);
const error97: InferErrors<typeof api.group2.section1.procedure97> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 98 },
};

const input98: InferInput<typeof api.group2.section1.procedure98> = {
  id: "item-98",
  cursor: 98,
  marker: 98,
};
const call98: Promise<InferOutput<typeof api.group2.section1.procedure98>> =
  client.group2.section1.procedure98.query(input98);
const error98: InferErrors<typeof api.group2.section1.procedure98> = {
  code: "FORBIDDEN",
  data: { resource: "procedure98" },
};

const input99: InferInput<typeof api.group2.section1.procedure99> = {
  id: "item-99",
  cursor: 99,
  marker: 99,
};
const call99: Promise<InferOutput<typeof api.group2.section1.procedure99>> =
  client.group2.section1.procedure99.mutate(input99);
const error99: InferErrors<typeof api.group2.section1.procedure99> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 100 },
};

const input100: InferInput<typeof api.group2.section2.procedure100> = {
  id: "item-100",
  cursor: 100,
  marker: 100,
};
const call100: Promise<InferOutput<typeof api.group2.section2.procedure100>> =
  client.group2.section2.procedure100.query(input100);
const error100: InferErrors<typeof api.group2.section2.procedure100> = {
  code: "FORBIDDEN",
  data: { resource: "procedure100" },
};

const input101: InferInput<typeof api.group2.section2.procedure101> = {
  id: "item-101",
  cursor: 101,
  marker: 101,
};
const call101: Promise<InferOutput<typeof api.group2.section2.procedure101>> =
  client.group2.section2.procedure101.mutate(input101);
const error101: InferErrors<typeof api.group2.section2.procedure101> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 102 },
};

const input102: InferInput<typeof api.group2.section2.procedure102> = {
  id: "item-102",
  cursor: 102,
  marker: 102,
};
const call102: Promise<InferOutput<typeof api.group2.section2.procedure102>> =
  client.group2.section2.procedure102.query(input102);
const error102: InferErrors<typeof api.group2.section2.procedure102> = {
  code: "FORBIDDEN",
  data: { resource: "procedure102" },
};

const input103: InferInput<typeof api.group2.section2.procedure103> = {
  id: "item-103",
  cursor: 103,
  marker: 103,
};
const call103: Promise<InferOutput<typeof api.group2.section2.procedure103>> =
  client.group2.section2.procedure103.mutate(input103);
const error103: InferErrors<typeof api.group2.section2.procedure103> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 104 },
};

const input104: InferInput<typeof api.group2.section2.procedure104> = {
  id: "item-104",
  cursor: 104,
  marker: 104,
};
const call104: Promise<InferOutput<typeof api.group2.section2.procedure104>> =
  client.group2.section2.procedure104.query(input104);
const error104: InferErrors<typeof api.group2.section2.procedure104> = {
  code: "FORBIDDEN",
  data: { resource: "procedure104" },
};

const input105: InferInput<typeof api.group2.section2.procedure105> = {
  id: "item-105",
  cursor: 105,
  marker: 105,
};
const call105: Promise<InferOutput<typeof api.group2.section2.procedure105>> =
  client.group2.section2.procedure105.mutate(input105);
const error105: InferErrors<typeof api.group2.section2.procedure105> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 106 },
};

const input106: InferInput<typeof api.group2.section2.procedure106> = {
  id: "item-106",
  cursor: 106,
  marker: 106,
};
const call106: Promise<InferOutput<typeof api.group2.section2.procedure106>> =
  client.group2.section2.procedure106.query(input106);
const error106: InferErrors<typeof api.group2.section2.procedure106> = {
  code: "FORBIDDEN",
  data: { resource: "procedure106" },
};

const input107: InferInput<typeof api.group2.section2.procedure107> = {
  id: "item-107",
  cursor: 107,
  marker: 107,
};
const call107: Promise<InferOutput<typeof api.group2.section2.procedure107>> =
  client.group2.section2.procedure107.mutate(input107);
const error107: InferErrors<typeof api.group2.section2.procedure107> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 108 },
};

const input108: InferInput<typeof api.group2.section2.procedure108> = {
  id: "item-108",
  cursor: 108,
  marker: 108,
};
const call108: Promise<InferOutput<typeof api.group2.section2.procedure108>> =
  client.group2.section2.procedure108.query(input108);
const error108: InferErrors<typeof api.group2.section2.procedure108> = {
  code: "FORBIDDEN",
  data: { resource: "procedure108" },
};

const input109: InferInput<typeof api.group2.section2.procedure109> = {
  id: "item-109",
  cursor: 109,
  marker: 109,
};
const call109: Promise<InferOutput<typeof api.group2.section2.procedure109>> =
  client.group2.section2.procedure109.mutate(input109);
const error109: InferErrors<typeof api.group2.section2.procedure109> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 110 },
};

const input110: InferInput<typeof api.group2.section3.procedure110> = {
  id: "item-110",
  cursor: 110,
  marker: 110,
};
const call110: Promise<InferOutput<typeof api.group2.section3.procedure110>> =
  client.group2.section3.procedure110.query(input110);
const error110: InferErrors<typeof api.group2.section3.procedure110> = {
  code: "FORBIDDEN",
  data: { resource: "procedure110" },
};

const input111: InferInput<typeof api.group2.section3.procedure111> = {
  id: "item-111",
  cursor: 111,
  marker: 111,
};
const call111: Promise<InferOutput<typeof api.group2.section3.procedure111>> =
  client.group2.section3.procedure111.mutate(input111);
const error111: InferErrors<typeof api.group2.section3.procedure111> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 112 },
};

const input112: InferInput<typeof api.group2.section3.procedure112> = {
  id: "item-112",
  cursor: 112,
  marker: 112,
};
const call112: Promise<InferOutput<typeof api.group2.section3.procedure112>> =
  client.group2.section3.procedure112.query(input112);
const error112: InferErrors<typeof api.group2.section3.procedure112> = {
  code: "FORBIDDEN",
  data: { resource: "procedure112" },
};

const input113: InferInput<typeof api.group2.section3.procedure113> = {
  id: "item-113",
  cursor: 113,
  marker: 113,
};
const call113: Promise<InferOutput<typeof api.group2.section3.procedure113>> =
  client.group2.section3.procedure113.mutate(input113);
const error113: InferErrors<typeof api.group2.section3.procedure113> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 114 },
};

const input114: InferInput<typeof api.group2.section3.procedure114> = {
  id: "item-114",
  cursor: 114,
  marker: 114,
};
const call114: Promise<InferOutput<typeof api.group2.section3.procedure114>> =
  client.group2.section3.procedure114.query(input114);
const error114: InferErrors<typeof api.group2.section3.procedure114> = {
  code: "FORBIDDEN",
  data: { resource: "procedure114" },
};

const input115: InferInput<typeof api.group2.section3.procedure115> = {
  id: "item-115",
  cursor: 115,
  marker: 115,
};
const call115: Promise<InferOutput<typeof api.group2.section3.procedure115>> =
  client.group2.section3.procedure115.mutate(input115);
const error115: InferErrors<typeof api.group2.section3.procedure115> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 116 },
};

const input116: InferInput<typeof api.group2.section3.procedure116> = {
  id: "item-116",
  cursor: 116,
  marker: 116,
};
const call116: Promise<InferOutput<typeof api.group2.section3.procedure116>> =
  client.group2.section3.procedure116.query(input116);
const error116: InferErrors<typeof api.group2.section3.procedure116> = {
  code: "FORBIDDEN",
  data: { resource: "procedure116" },
};

const input117: InferInput<typeof api.group2.section3.procedure117> = {
  id: "item-117",
  cursor: 117,
  marker: 117,
};
const call117: Promise<InferOutput<typeof api.group2.section3.procedure117>> =
  client.group2.section3.procedure117.mutate(input117);
const error117: InferErrors<typeof api.group2.section3.procedure117> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 118 },
};

const input118: InferInput<typeof api.group2.section3.procedure118> = {
  id: "item-118",
  cursor: 118,
  marker: 118,
};
const call118: Promise<InferOutput<typeof api.group2.section3.procedure118>> =
  client.group2.section3.procedure118.query(input118);
const error118: InferErrors<typeof api.group2.section3.procedure118> = {
  code: "FORBIDDEN",
  data: { resource: "procedure118" },
};

const input119: InferInput<typeof api.group2.section3.procedure119> = {
  id: "item-119",
  cursor: 119,
  marker: 119,
};
const call119: Promise<InferOutput<typeof api.group2.section3.procedure119>> =
  client.group2.section3.procedure119.mutate(input119);
const error119: InferErrors<typeof api.group2.section3.procedure119> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 120 },
};

const input120: InferInput<typeof api.group3.section0.procedure120> = {
  id: "item-120",
  cursor: 120,
  marker: 120,
};
const call120: Promise<InferOutput<typeof api.group3.section0.procedure120>> =
  client.group3.section0.procedure120.query(input120);
const error120: InferErrors<typeof api.group3.section0.procedure120> = {
  code: "FORBIDDEN",
  data: { resource: "procedure120" },
};

const input121: InferInput<typeof api.group3.section0.procedure121> = {
  id: "item-121",
  cursor: 121,
  marker: 121,
};
const call121: Promise<InferOutput<typeof api.group3.section0.procedure121>> =
  client.group3.section0.procedure121.mutate(input121);
const error121: InferErrors<typeof api.group3.section0.procedure121> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 122 },
};

const input122: InferInput<typeof api.group3.section0.procedure122> = {
  id: "item-122",
  cursor: 122,
  marker: 122,
};
const call122: Promise<InferOutput<typeof api.group3.section0.procedure122>> =
  client.group3.section0.procedure122.query(input122);
const error122: InferErrors<typeof api.group3.section0.procedure122> = {
  code: "FORBIDDEN",
  data: { resource: "procedure122" },
};

const input123: InferInput<typeof api.group3.section0.procedure123> = {
  id: "item-123",
  cursor: 123,
  marker: 123,
};
const call123: Promise<InferOutput<typeof api.group3.section0.procedure123>> =
  client.group3.section0.procedure123.mutate(input123);
const error123: InferErrors<typeof api.group3.section0.procedure123> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 124 },
};

const input124: InferInput<typeof api.group3.section0.procedure124> = {
  id: "item-124",
  cursor: 124,
  marker: 124,
};
const call124: Promise<InferOutput<typeof api.group3.section0.procedure124>> =
  client.group3.section0.procedure124.query(input124);
const error124: InferErrors<typeof api.group3.section0.procedure124> = {
  code: "FORBIDDEN",
  data: { resource: "procedure124" },
};

const input125: InferInput<typeof api.group3.section0.procedure125> = {
  id: "item-125",
  cursor: 125,
  marker: 125,
};
const call125: Promise<InferOutput<typeof api.group3.section0.procedure125>> =
  client.group3.section0.procedure125.mutate(input125);
const error125: InferErrors<typeof api.group3.section0.procedure125> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 126 },
};

const input126: InferInput<typeof api.group3.section0.procedure126> = {
  id: "item-126",
  cursor: 126,
  marker: 126,
};
const call126: Promise<InferOutput<typeof api.group3.section0.procedure126>> =
  client.group3.section0.procedure126.query(input126);
const error126: InferErrors<typeof api.group3.section0.procedure126> = {
  code: "FORBIDDEN",
  data: { resource: "procedure126" },
};

const input127: InferInput<typeof api.group3.section0.procedure127> = {
  id: "item-127",
  cursor: 127,
  marker: 127,
};
const call127: Promise<InferOutput<typeof api.group3.section0.procedure127>> =
  client.group3.section0.procedure127.mutate(input127);
const error127: InferErrors<typeof api.group3.section0.procedure127> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 128 },
};

const input128: InferInput<typeof api.group3.section0.procedure128> = {
  id: "item-128",
  cursor: 128,
  marker: 128,
};
const call128: Promise<InferOutput<typeof api.group3.section0.procedure128>> =
  client.group3.section0.procedure128.query(input128);
const error128: InferErrors<typeof api.group3.section0.procedure128> = {
  code: "FORBIDDEN",
  data: { resource: "procedure128" },
};

const input129: InferInput<typeof api.group3.section0.procedure129> = {
  id: "item-129",
  cursor: 129,
  marker: 129,
};
const call129: Promise<InferOutput<typeof api.group3.section0.procedure129>> =
  client.group3.section0.procedure129.mutate(input129);
const error129: InferErrors<typeof api.group3.section0.procedure129> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 130 },
};

const input130: InferInput<typeof api.group3.section1.procedure130> = {
  id: "item-130",
  cursor: 130,
  marker: 130,
};
const call130: Promise<InferOutput<typeof api.group3.section1.procedure130>> =
  client.group3.section1.procedure130.query(input130);
const error130: InferErrors<typeof api.group3.section1.procedure130> = {
  code: "FORBIDDEN",
  data: { resource: "procedure130" },
};

const input131: InferInput<typeof api.group3.section1.procedure131> = {
  id: "item-131",
  cursor: 131,
  marker: 131,
};
const call131: Promise<InferOutput<typeof api.group3.section1.procedure131>> =
  client.group3.section1.procedure131.mutate(input131);
const error131: InferErrors<typeof api.group3.section1.procedure131> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 132 },
};

const input132: InferInput<typeof api.group3.section1.procedure132> = {
  id: "item-132",
  cursor: 132,
  marker: 132,
};
const call132: Promise<InferOutput<typeof api.group3.section1.procedure132>> =
  client.group3.section1.procedure132.query(input132);
const error132: InferErrors<typeof api.group3.section1.procedure132> = {
  code: "FORBIDDEN",
  data: { resource: "procedure132" },
};

const input133: InferInput<typeof api.group3.section1.procedure133> = {
  id: "item-133",
  cursor: 133,
  marker: 133,
};
const call133: Promise<InferOutput<typeof api.group3.section1.procedure133>> =
  client.group3.section1.procedure133.mutate(input133);
const error133: InferErrors<typeof api.group3.section1.procedure133> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 134 },
};

const input134: InferInput<typeof api.group3.section1.procedure134> = {
  id: "item-134",
  cursor: 134,
  marker: 134,
};
const call134: Promise<InferOutput<typeof api.group3.section1.procedure134>> =
  client.group3.section1.procedure134.query(input134);
const error134: InferErrors<typeof api.group3.section1.procedure134> = {
  code: "FORBIDDEN",
  data: { resource: "procedure134" },
};

const input135: InferInput<typeof api.group3.section1.procedure135> = {
  id: "item-135",
  cursor: 135,
  marker: 135,
};
const call135: Promise<InferOutput<typeof api.group3.section1.procedure135>> =
  client.group3.section1.procedure135.mutate(input135);
const error135: InferErrors<typeof api.group3.section1.procedure135> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 136 },
};

const input136: InferInput<typeof api.group3.section1.procedure136> = {
  id: "item-136",
  cursor: 136,
  marker: 136,
};
const call136: Promise<InferOutput<typeof api.group3.section1.procedure136>> =
  client.group3.section1.procedure136.query(input136);
const error136: InferErrors<typeof api.group3.section1.procedure136> = {
  code: "FORBIDDEN",
  data: { resource: "procedure136" },
};

const input137: InferInput<typeof api.group3.section1.procedure137> = {
  id: "item-137",
  cursor: 137,
  marker: 137,
};
const call137: Promise<InferOutput<typeof api.group3.section1.procedure137>> =
  client.group3.section1.procedure137.mutate(input137);
const error137: InferErrors<typeof api.group3.section1.procedure137> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 138 },
};

const input138: InferInput<typeof api.group3.section1.procedure138> = {
  id: "item-138",
  cursor: 138,
  marker: 138,
};
const call138: Promise<InferOutput<typeof api.group3.section1.procedure138>> =
  client.group3.section1.procedure138.query(input138);
const error138: InferErrors<typeof api.group3.section1.procedure138> = {
  code: "FORBIDDEN",
  data: { resource: "procedure138" },
};

const input139: InferInput<typeof api.group3.section1.procedure139> = {
  id: "item-139",
  cursor: 139,
  marker: 139,
};
const call139: Promise<InferOutput<typeof api.group3.section1.procedure139>> =
  client.group3.section1.procedure139.mutate(input139);
const error139: InferErrors<typeof api.group3.section1.procedure139> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 140 },
};

const input140: InferInput<typeof api.group3.section2.procedure140> = {
  id: "item-140",
  cursor: 140,
  marker: 140,
};
const call140: Promise<InferOutput<typeof api.group3.section2.procedure140>> =
  client.group3.section2.procedure140.query(input140);
const error140: InferErrors<typeof api.group3.section2.procedure140> = {
  code: "FORBIDDEN",
  data: { resource: "procedure140" },
};

const input141: InferInput<typeof api.group3.section2.procedure141> = {
  id: "item-141",
  cursor: 141,
  marker: 141,
};
const call141: Promise<InferOutput<typeof api.group3.section2.procedure141>> =
  client.group3.section2.procedure141.mutate(input141);
const error141: InferErrors<typeof api.group3.section2.procedure141> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 142 },
};

const input142: InferInput<typeof api.group3.section2.procedure142> = {
  id: "item-142",
  cursor: 142,
  marker: 142,
};
const call142: Promise<InferOutput<typeof api.group3.section2.procedure142>> =
  client.group3.section2.procedure142.query(input142);
const error142: InferErrors<typeof api.group3.section2.procedure142> = {
  code: "FORBIDDEN",
  data: { resource: "procedure142" },
};

const input143: InferInput<typeof api.group3.section2.procedure143> = {
  id: "item-143",
  cursor: 143,
  marker: 143,
};
const call143: Promise<InferOutput<typeof api.group3.section2.procedure143>> =
  client.group3.section2.procedure143.mutate(input143);
const error143: InferErrors<typeof api.group3.section2.procedure143> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 144 },
};

const input144: InferInput<typeof api.group3.section2.procedure144> = {
  id: "item-144",
  cursor: 144,
  marker: 144,
};
const call144: Promise<InferOutput<typeof api.group3.section2.procedure144>> =
  client.group3.section2.procedure144.query(input144);
const error144: InferErrors<typeof api.group3.section2.procedure144> = {
  code: "FORBIDDEN",
  data: { resource: "procedure144" },
};

const input145: InferInput<typeof api.group3.section2.procedure145> = {
  id: "item-145",
  cursor: 145,
  marker: 145,
};
const call145: Promise<InferOutput<typeof api.group3.section2.procedure145>> =
  client.group3.section2.procedure145.mutate(input145);
const error145: InferErrors<typeof api.group3.section2.procedure145> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 146 },
};

const input146: InferInput<typeof api.group3.section2.procedure146> = {
  id: "item-146",
  cursor: 146,
  marker: 146,
};
const call146: Promise<InferOutput<typeof api.group3.section2.procedure146>> =
  client.group3.section2.procedure146.query(input146);
const error146: InferErrors<typeof api.group3.section2.procedure146> = {
  code: "FORBIDDEN",
  data: { resource: "procedure146" },
};

const input147: InferInput<typeof api.group3.section2.procedure147> = {
  id: "item-147",
  cursor: 147,
  marker: 147,
};
const call147: Promise<InferOutput<typeof api.group3.section2.procedure147>> =
  client.group3.section2.procedure147.mutate(input147);
const error147: InferErrors<typeof api.group3.section2.procedure147> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 148 },
};

const input148: InferInput<typeof api.group3.section2.procedure148> = {
  id: "item-148",
  cursor: 148,
  marker: 148,
};
const call148: Promise<InferOutput<typeof api.group3.section2.procedure148>> =
  client.group3.section2.procedure148.query(input148);
const error148: InferErrors<typeof api.group3.section2.procedure148> = {
  code: "FORBIDDEN",
  data: { resource: "procedure148" },
};

const input149: InferInput<typeof api.group3.section2.procedure149> = {
  id: "item-149",
  cursor: 149,
  marker: 149,
};
const call149: Promise<InferOutput<typeof api.group3.section2.procedure149>> =
  client.group3.section2.procedure149.mutate(input149);
const error149: InferErrors<typeof api.group3.section2.procedure149> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 150 },
};

const input150: InferInput<typeof api.group3.section3.procedure150> = {
  id: "item-150",
  cursor: 150,
  marker: 150,
};
const call150: Promise<InferOutput<typeof api.group3.section3.procedure150>> =
  client.group3.section3.procedure150.query(input150);
const error150: InferErrors<typeof api.group3.section3.procedure150> = {
  code: "FORBIDDEN",
  data: { resource: "procedure150" },
};

const input151: InferInput<typeof api.group3.section3.procedure151> = {
  id: "item-151",
  cursor: 151,
  marker: 151,
};
const call151: Promise<InferOutput<typeof api.group3.section3.procedure151>> =
  client.group3.section3.procedure151.mutate(input151);
const error151: InferErrors<typeof api.group3.section3.procedure151> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 152 },
};

const input152: InferInput<typeof api.group3.section3.procedure152> = {
  id: "item-152",
  cursor: 152,
  marker: 152,
};
const call152: Promise<InferOutput<typeof api.group3.section3.procedure152>> =
  client.group3.section3.procedure152.query(input152);
const error152: InferErrors<typeof api.group3.section3.procedure152> = {
  code: "FORBIDDEN",
  data: { resource: "procedure152" },
};

const input153: InferInput<typeof api.group3.section3.procedure153> = {
  id: "item-153",
  cursor: 153,
  marker: 153,
};
const call153: Promise<InferOutput<typeof api.group3.section3.procedure153>> =
  client.group3.section3.procedure153.mutate(input153);
const error153: InferErrors<typeof api.group3.section3.procedure153> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 154 },
};

const input154: InferInput<typeof api.group3.section3.procedure154> = {
  id: "item-154",
  cursor: 154,
  marker: 154,
};
const call154: Promise<InferOutput<typeof api.group3.section3.procedure154>> =
  client.group3.section3.procedure154.query(input154);
const error154: InferErrors<typeof api.group3.section3.procedure154> = {
  code: "FORBIDDEN",
  data: { resource: "procedure154" },
};

const input155: InferInput<typeof api.group3.section3.procedure155> = {
  id: "item-155",
  cursor: 155,
  marker: 155,
};
const call155: Promise<InferOutput<typeof api.group3.section3.procedure155>> =
  client.group3.section3.procedure155.mutate(input155);
const error155: InferErrors<typeof api.group3.section3.procedure155> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 156 },
};

const input156: InferInput<typeof api.group3.section3.procedure156> = {
  id: "item-156",
  cursor: 156,
  marker: 156,
};
const call156: Promise<InferOutput<typeof api.group3.section3.procedure156>> =
  client.group3.section3.procedure156.query(input156);
const error156: InferErrors<typeof api.group3.section3.procedure156> = {
  code: "FORBIDDEN",
  data: { resource: "procedure156" },
};

const input157: InferInput<typeof api.group3.section3.procedure157> = {
  id: "item-157",
  cursor: 157,
  marker: 157,
};
const call157: Promise<InferOutput<typeof api.group3.section3.procedure157>> =
  client.group3.section3.procedure157.mutate(input157);
const error157: InferErrors<typeof api.group3.section3.procedure157> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 158 },
};

const input158: InferInput<typeof api.group3.section3.procedure158> = {
  id: "item-158",
  cursor: 158,
  marker: 158,
};
const call158: Promise<InferOutput<typeof api.group3.section3.procedure158>> =
  client.group3.section3.procedure158.query(input158);
const error158: InferErrors<typeof api.group3.section3.procedure158> = {
  code: "FORBIDDEN",
  data: { resource: "procedure158" },
};

const input159: InferInput<typeof api.group3.section3.procedure159> = {
  id: "item-159",
  cursor: 159,
  marker: 159,
};
const call159: Promise<InferOutput<typeof api.group3.section3.procedure159>> =
  client.group3.section3.procedure159.mutate(input159);
const error159: InferErrors<typeof api.group3.section3.procedure159> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 160 },
};

const input160: InferInput<typeof api.group4.section0.procedure160> = {
  id: "item-160",
  cursor: 160,
  marker: 160,
};
const call160: Promise<InferOutput<typeof api.group4.section0.procedure160>> =
  client.group4.section0.procedure160.query(input160);
const error160: InferErrors<typeof api.group4.section0.procedure160> = {
  code: "FORBIDDEN",
  data: { resource: "procedure160" },
};

const input161: InferInput<typeof api.group4.section0.procedure161> = {
  id: "item-161",
  cursor: 161,
  marker: 161,
};
const call161: Promise<InferOutput<typeof api.group4.section0.procedure161>> =
  client.group4.section0.procedure161.mutate(input161);
const error161: InferErrors<typeof api.group4.section0.procedure161> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 162 },
};

const input162: InferInput<typeof api.group4.section0.procedure162> = {
  id: "item-162",
  cursor: 162,
  marker: 162,
};
const call162: Promise<InferOutput<typeof api.group4.section0.procedure162>> =
  client.group4.section0.procedure162.query(input162);
const error162: InferErrors<typeof api.group4.section0.procedure162> = {
  code: "FORBIDDEN",
  data: { resource: "procedure162" },
};

const input163: InferInput<typeof api.group4.section0.procedure163> = {
  id: "item-163",
  cursor: 163,
  marker: 163,
};
const call163: Promise<InferOutput<typeof api.group4.section0.procedure163>> =
  client.group4.section0.procedure163.mutate(input163);
const error163: InferErrors<typeof api.group4.section0.procedure163> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 164 },
};

const input164: InferInput<typeof api.group4.section0.procedure164> = {
  id: "item-164",
  cursor: 164,
  marker: 164,
};
const call164: Promise<InferOutput<typeof api.group4.section0.procedure164>> =
  client.group4.section0.procedure164.query(input164);
const error164: InferErrors<typeof api.group4.section0.procedure164> = {
  code: "FORBIDDEN",
  data: { resource: "procedure164" },
};

const input165: InferInput<typeof api.group4.section0.procedure165> = {
  id: "item-165",
  cursor: 165,
  marker: 165,
};
const call165: Promise<InferOutput<typeof api.group4.section0.procedure165>> =
  client.group4.section0.procedure165.mutate(input165);
const error165: InferErrors<typeof api.group4.section0.procedure165> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 166 },
};

const input166: InferInput<typeof api.group4.section0.procedure166> = {
  id: "item-166",
  cursor: 166,
  marker: 166,
};
const call166: Promise<InferOutput<typeof api.group4.section0.procedure166>> =
  client.group4.section0.procedure166.query(input166);
const error166: InferErrors<typeof api.group4.section0.procedure166> = {
  code: "FORBIDDEN",
  data: { resource: "procedure166" },
};

const input167: InferInput<typeof api.group4.section0.procedure167> = {
  id: "item-167",
  cursor: 167,
  marker: 167,
};
const call167: Promise<InferOutput<typeof api.group4.section0.procedure167>> =
  client.group4.section0.procedure167.mutate(input167);
const error167: InferErrors<typeof api.group4.section0.procedure167> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 168 },
};

const input168: InferInput<typeof api.group4.section0.procedure168> = {
  id: "item-168",
  cursor: 168,
  marker: 168,
};
const call168: Promise<InferOutput<typeof api.group4.section0.procedure168>> =
  client.group4.section0.procedure168.query(input168);
const error168: InferErrors<typeof api.group4.section0.procedure168> = {
  code: "FORBIDDEN",
  data: { resource: "procedure168" },
};

const input169: InferInput<typeof api.group4.section0.procedure169> = {
  id: "item-169",
  cursor: 169,
  marker: 169,
};
const call169: Promise<InferOutput<typeof api.group4.section0.procedure169>> =
  client.group4.section0.procedure169.mutate(input169);
const error169: InferErrors<typeof api.group4.section0.procedure169> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 170 },
};

const input170: InferInput<typeof api.group4.section1.procedure170> = {
  id: "item-170",
  cursor: 170,
  marker: 170,
};
const call170: Promise<InferOutput<typeof api.group4.section1.procedure170>> =
  client.group4.section1.procedure170.query(input170);
const error170: InferErrors<typeof api.group4.section1.procedure170> = {
  code: "FORBIDDEN",
  data: { resource: "procedure170" },
};

const input171: InferInput<typeof api.group4.section1.procedure171> = {
  id: "item-171",
  cursor: 171,
  marker: 171,
};
const call171: Promise<InferOutput<typeof api.group4.section1.procedure171>> =
  client.group4.section1.procedure171.mutate(input171);
const error171: InferErrors<typeof api.group4.section1.procedure171> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 172 },
};

const input172: InferInput<typeof api.group4.section1.procedure172> = {
  id: "item-172",
  cursor: 172,
  marker: 172,
};
const call172: Promise<InferOutput<typeof api.group4.section1.procedure172>> =
  client.group4.section1.procedure172.query(input172);
const error172: InferErrors<typeof api.group4.section1.procedure172> = {
  code: "FORBIDDEN",
  data: { resource: "procedure172" },
};

const input173: InferInput<typeof api.group4.section1.procedure173> = {
  id: "item-173",
  cursor: 173,
  marker: 173,
};
const call173: Promise<InferOutput<typeof api.group4.section1.procedure173>> =
  client.group4.section1.procedure173.mutate(input173);
const error173: InferErrors<typeof api.group4.section1.procedure173> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 174 },
};

const input174: InferInput<typeof api.group4.section1.procedure174> = {
  id: "item-174",
  cursor: 174,
  marker: 174,
};
const call174: Promise<InferOutput<typeof api.group4.section1.procedure174>> =
  client.group4.section1.procedure174.query(input174);
const error174: InferErrors<typeof api.group4.section1.procedure174> = {
  code: "FORBIDDEN",
  data: { resource: "procedure174" },
};

const input175: InferInput<typeof api.group4.section1.procedure175> = {
  id: "item-175",
  cursor: 175,
  marker: 175,
};
const call175: Promise<InferOutput<typeof api.group4.section1.procedure175>> =
  client.group4.section1.procedure175.mutate(input175);
const error175: InferErrors<typeof api.group4.section1.procedure175> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 176 },
};

const input176: InferInput<typeof api.group4.section1.procedure176> = {
  id: "item-176",
  cursor: 176,
  marker: 176,
};
const call176: Promise<InferOutput<typeof api.group4.section1.procedure176>> =
  client.group4.section1.procedure176.query(input176);
const error176: InferErrors<typeof api.group4.section1.procedure176> = {
  code: "FORBIDDEN",
  data: { resource: "procedure176" },
};

const input177: InferInput<typeof api.group4.section1.procedure177> = {
  id: "item-177",
  cursor: 177,
  marker: 177,
};
const call177: Promise<InferOutput<typeof api.group4.section1.procedure177>> =
  client.group4.section1.procedure177.mutate(input177);
const error177: InferErrors<typeof api.group4.section1.procedure177> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 178 },
};

const input178: InferInput<typeof api.group4.section1.procedure178> = {
  id: "item-178",
  cursor: 178,
  marker: 178,
};
const call178: Promise<InferOutput<typeof api.group4.section1.procedure178>> =
  client.group4.section1.procedure178.query(input178);
const error178: InferErrors<typeof api.group4.section1.procedure178> = {
  code: "FORBIDDEN",
  data: { resource: "procedure178" },
};

const input179: InferInput<typeof api.group4.section1.procedure179> = {
  id: "item-179",
  cursor: 179,
  marker: 179,
};
const call179: Promise<InferOutput<typeof api.group4.section1.procedure179>> =
  client.group4.section1.procedure179.mutate(input179);
const error179: InferErrors<typeof api.group4.section1.procedure179> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 180 },
};

const input180: InferInput<typeof api.group4.section2.procedure180> = {
  id: "item-180",
  cursor: 180,
  marker: 180,
};
const call180: Promise<InferOutput<typeof api.group4.section2.procedure180>> =
  client.group4.section2.procedure180.query(input180);
const error180: InferErrors<typeof api.group4.section2.procedure180> = {
  code: "FORBIDDEN",
  data: { resource: "procedure180" },
};

const input181: InferInput<typeof api.group4.section2.procedure181> = {
  id: "item-181",
  cursor: 181,
  marker: 181,
};
const call181: Promise<InferOutput<typeof api.group4.section2.procedure181>> =
  client.group4.section2.procedure181.mutate(input181);
const error181: InferErrors<typeof api.group4.section2.procedure181> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 182 },
};

const input182: InferInput<typeof api.group4.section2.procedure182> = {
  id: "item-182",
  cursor: 182,
  marker: 182,
};
const call182: Promise<InferOutput<typeof api.group4.section2.procedure182>> =
  client.group4.section2.procedure182.query(input182);
const error182: InferErrors<typeof api.group4.section2.procedure182> = {
  code: "FORBIDDEN",
  data: { resource: "procedure182" },
};

const input183: InferInput<typeof api.group4.section2.procedure183> = {
  id: "item-183",
  cursor: 183,
  marker: 183,
};
const call183: Promise<InferOutput<typeof api.group4.section2.procedure183>> =
  client.group4.section2.procedure183.mutate(input183);
const error183: InferErrors<typeof api.group4.section2.procedure183> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 184 },
};

const input184: InferInput<typeof api.group4.section2.procedure184> = {
  id: "item-184",
  cursor: 184,
  marker: 184,
};
const call184: Promise<InferOutput<typeof api.group4.section2.procedure184>> =
  client.group4.section2.procedure184.query(input184);
const error184: InferErrors<typeof api.group4.section2.procedure184> = {
  code: "FORBIDDEN",
  data: { resource: "procedure184" },
};

const input185: InferInput<typeof api.group4.section2.procedure185> = {
  id: "item-185",
  cursor: 185,
  marker: 185,
};
const call185: Promise<InferOutput<typeof api.group4.section2.procedure185>> =
  client.group4.section2.procedure185.mutate(input185);
const error185: InferErrors<typeof api.group4.section2.procedure185> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 186 },
};

const input186: InferInput<typeof api.group4.section2.procedure186> = {
  id: "item-186",
  cursor: 186,
  marker: 186,
};
const call186: Promise<InferOutput<typeof api.group4.section2.procedure186>> =
  client.group4.section2.procedure186.query(input186);
const error186: InferErrors<typeof api.group4.section2.procedure186> = {
  code: "FORBIDDEN",
  data: { resource: "procedure186" },
};

const input187: InferInput<typeof api.group4.section2.procedure187> = {
  id: "item-187",
  cursor: 187,
  marker: 187,
};
const call187: Promise<InferOutput<typeof api.group4.section2.procedure187>> =
  client.group4.section2.procedure187.mutate(input187);
const error187: InferErrors<typeof api.group4.section2.procedure187> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 188 },
};

const input188: InferInput<typeof api.group4.section2.procedure188> = {
  id: "item-188",
  cursor: 188,
  marker: 188,
};
const call188: Promise<InferOutput<typeof api.group4.section2.procedure188>> =
  client.group4.section2.procedure188.query(input188);
const error188: InferErrors<typeof api.group4.section2.procedure188> = {
  code: "FORBIDDEN",
  data: { resource: "procedure188" },
};

const input189: InferInput<typeof api.group4.section2.procedure189> = {
  id: "item-189",
  cursor: 189,
  marker: 189,
};
const call189: Promise<InferOutput<typeof api.group4.section2.procedure189>> =
  client.group4.section2.procedure189.mutate(input189);
const error189: InferErrors<typeof api.group4.section2.procedure189> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 190 },
};

const input190: InferInput<typeof api.group4.section3.procedure190> = {
  id: "item-190",
  cursor: 190,
  marker: 190,
};
const call190: Promise<InferOutput<typeof api.group4.section3.procedure190>> =
  client.group4.section3.procedure190.query(input190);
const error190: InferErrors<typeof api.group4.section3.procedure190> = {
  code: "FORBIDDEN",
  data: { resource: "procedure190" },
};

const input191: InferInput<typeof api.group4.section3.procedure191> = {
  id: "item-191",
  cursor: 191,
  marker: 191,
};
const call191: Promise<InferOutput<typeof api.group4.section3.procedure191>> =
  client.group4.section3.procedure191.mutate(input191);
const error191: InferErrors<typeof api.group4.section3.procedure191> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 192 },
};

const input192: InferInput<typeof api.group4.section3.procedure192> = {
  id: "item-192",
  cursor: 192,
  marker: 192,
};
const call192: Promise<InferOutput<typeof api.group4.section3.procedure192>> =
  client.group4.section3.procedure192.query(input192);
const error192: InferErrors<typeof api.group4.section3.procedure192> = {
  code: "FORBIDDEN",
  data: { resource: "procedure192" },
};

const input193: InferInput<typeof api.group4.section3.procedure193> = {
  id: "item-193",
  cursor: 193,
  marker: 193,
};
const call193: Promise<InferOutput<typeof api.group4.section3.procedure193>> =
  client.group4.section3.procedure193.mutate(input193);
const error193: InferErrors<typeof api.group4.section3.procedure193> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 194 },
};

const input194: InferInput<typeof api.group4.section3.procedure194> = {
  id: "item-194",
  cursor: 194,
  marker: 194,
};
const call194: Promise<InferOutput<typeof api.group4.section3.procedure194>> =
  client.group4.section3.procedure194.query(input194);
const error194: InferErrors<typeof api.group4.section3.procedure194> = {
  code: "FORBIDDEN",
  data: { resource: "procedure194" },
};

const input195: InferInput<typeof api.group4.section3.procedure195> = {
  id: "item-195",
  cursor: 195,
  marker: 195,
};
const call195: Promise<InferOutput<typeof api.group4.section3.procedure195>> =
  client.group4.section3.procedure195.mutate(input195);
const error195: InferErrors<typeof api.group4.section3.procedure195> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 196 },
};

const input196: InferInput<typeof api.group4.section3.procedure196> = {
  id: "item-196",
  cursor: 196,
  marker: 196,
};
const call196: Promise<InferOutput<typeof api.group4.section3.procedure196>> =
  client.group4.section3.procedure196.query(input196);
const error196: InferErrors<typeof api.group4.section3.procedure196> = {
  code: "FORBIDDEN",
  data: { resource: "procedure196" },
};

const input197: InferInput<typeof api.group4.section3.procedure197> = {
  id: "item-197",
  cursor: 197,
  marker: 197,
};
const call197: Promise<InferOutput<typeof api.group4.section3.procedure197>> =
  client.group4.section3.procedure197.mutate(input197);
const error197: InferErrors<typeof api.group4.section3.procedure197> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 198 },
};

const input198: InferInput<typeof api.group4.section3.procedure198> = {
  id: "item-198",
  cursor: 198,
  marker: 198,
};
const call198: Promise<InferOutput<typeof api.group4.section3.procedure198>> =
  client.group4.section3.procedure198.query(input198);
const error198: InferErrors<typeof api.group4.section3.procedure198> = {
  code: "FORBIDDEN",
  data: { resource: "procedure198" },
};

const input199: InferInput<typeof api.group4.section3.procedure199> = {
  id: "item-199",
  cursor: 199,
  marker: 199,
};
const call199: Promise<InferOutput<typeof api.group4.section3.procedure199>> =
  client.group4.section3.procedure199.mutate(input199);
const error199: InferErrors<typeof api.group4.section3.procedure199> = {
  code: "RATE_LIMITED",
  data: { retryAfter: 200 },
};

export const procedureInputs = [
  input0,
  input1,
  input2,
  input3,
  input4,
  input5,
  input6,
  input7,
  input8,
  input9,
  input10,
  input11,
  input12,
  input13,
  input14,
  input15,
  input16,
  input17,
  input18,
  input19,
  input20,
  input21,
  input22,
  input23,
  input24,
  input25,
  input26,
  input27,
  input28,
  input29,
  input30,
  input31,
  input32,
  input33,
  input34,
  input35,
  input36,
  input37,
  input38,
  input39,
  input40,
  input41,
  input42,
  input43,
  input44,
  input45,
  input46,
  input47,
  input48,
  input49,
  input50,
  input51,
  input52,
  input53,
  input54,
  input55,
  input56,
  input57,
  input58,
  input59,
  input60,
  input61,
  input62,
  input63,
  input64,
  input65,
  input66,
  input67,
  input68,
  input69,
  input70,
  input71,
  input72,
  input73,
  input74,
  input75,
  input76,
  input77,
  input78,
  input79,
  input80,
  input81,
  input82,
  input83,
  input84,
  input85,
  input86,
  input87,
  input88,
  input89,
  input90,
  input91,
  input92,
  input93,
  input94,
  input95,
  input96,
  input97,
  input98,
  input99,
  input100,
  input101,
  input102,
  input103,
  input104,
  input105,
  input106,
  input107,
  input108,
  input109,
  input110,
  input111,
  input112,
  input113,
  input114,
  input115,
  input116,
  input117,
  input118,
  input119,
  input120,
  input121,
  input122,
  input123,
  input124,
  input125,
  input126,
  input127,
  input128,
  input129,
  input130,
  input131,
  input132,
  input133,
  input134,
  input135,
  input136,
  input137,
  input138,
  input139,
  input140,
  input141,
  input142,
  input143,
  input144,
  input145,
  input146,
  input147,
  input148,
  input149,
  input150,
  input151,
  input152,
  input153,
  input154,
  input155,
  input156,
  input157,
  input158,
  input159,
  input160,
  input161,
  input162,
  input163,
  input164,
  input165,
  input166,
  input167,
  input168,
  input169,
  input170,
  input171,
  input172,
  input173,
  input174,
  input175,
  input176,
  input177,
  input178,
  input179,
  input180,
  input181,
  input182,
  input183,
  input184,
  input185,
  input186,
  input187,
  input188,
  input189,
  input190,
  input191,
  input192,
  input193,
  input194,
  input195,
  input196,
  input197,
  input198,
  input199,
] as const;
export const procedureCalls = [
  call0,
  call1,
  call2,
  call3,
  call4,
  call5,
  call6,
  call7,
  call8,
  call9,
  call10,
  call11,
  call12,
  call13,
  call14,
  call15,
  call16,
  call17,
  call18,
  call19,
  call20,
  call21,
  call22,
  call23,
  call24,
  call25,
  call26,
  call27,
  call28,
  call29,
  call30,
  call31,
  call32,
  call33,
  call34,
  call35,
  call36,
  call37,
  call38,
  call39,
  call40,
  call41,
  call42,
  call43,
  call44,
  call45,
  call46,
  call47,
  call48,
  call49,
  call50,
  call51,
  call52,
  call53,
  call54,
  call55,
  call56,
  call57,
  call58,
  call59,
  call60,
  call61,
  call62,
  call63,
  call64,
  call65,
  call66,
  call67,
  call68,
  call69,
  call70,
  call71,
  call72,
  call73,
  call74,
  call75,
  call76,
  call77,
  call78,
  call79,
  call80,
  call81,
  call82,
  call83,
  call84,
  call85,
  call86,
  call87,
  call88,
  call89,
  call90,
  call91,
  call92,
  call93,
  call94,
  call95,
  call96,
  call97,
  call98,
  call99,
  call100,
  call101,
  call102,
  call103,
  call104,
  call105,
  call106,
  call107,
  call108,
  call109,
  call110,
  call111,
  call112,
  call113,
  call114,
  call115,
  call116,
  call117,
  call118,
  call119,
  call120,
  call121,
  call122,
  call123,
  call124,
  call125,
  call126,
  call127,
  call128,
  call129,
  call130,
  call131,
  call132,
  call133,
  call134,
  call135,
  call136,
  call137,
  call138,
  call139,
  call140,
  call141,
  call142,
  call143,
  call144,
  call145,
  call146,
  call147,
  call148,
  call149,
  call150,
  call151,
  call152,
  call153,
  call154,
  call155,
  call156,
  call157,
  call158,
  call159,
  call160,
  call161,
  call162,
  call163,
  call164,
  call165,
  call166,
  call167,
  call168,
  call169,
  call170,
  call171,
  call172,
  call173,
  call174,
  call175,
  call176,
  call177,
  call178,
  call179,
  call180,
  call181,
  call182,
  call183,
  call184,
  call185,
  call186,
  call187,
  call188,
  call189,
  call190,
  call191,
  call192,
  call193,
  call194,
  call195,
  call196,
  call197,
  call198,
  call199,
] as const;
export const procedureErrors = [
  error0,
  error1,
  error2,
  error3,
  error4,
  error5,
  error6,
  error7,
  error8,
  error9,
  error10,
  error11,
  error12,
  error13,
  error14,
  error15,
  error16,
  error17,
  error18,
  error19,
  error20,
  error21,
  error22,
  error23,
  error24,
  error25,
  error26,
  error27,
  error28,
  error29,
  error30,
  error31,
  error32,
  error33,
  error34,
  error35,
  error36,
  error37,
  error38,
  error39,
  error40,
  error41,
  error42,
  error43,
  error44,
  error45,
  error46,
  error47,
  error48,
  error49,
  error50,
  error51,
  error52,
  error53,
  error54,
  error55,
  error56,
  error57,
  error58,
  error59,
  error60,
  error61,
  error62,
  error63,
  error64,
  error65,
  error66,
  error67,
  error68,
  error69,
  error70,
  error71,
  error72,
  error73,
  error74,
  error75,
  error76,
  error77,
  error78,
  error79,
  error80,
  error81,
  error82,
  error83,
  error84,
  error85,
  error86,
  error87,
  error88,
  error89,
  error90,
  error91,
  error92,
  error93,
  error94,
  error95,
  error96,
  error97,
  error98,
  error99,
  error100,
  error101,
  error102,
  error103,
  error104,
  error105,
  error106,
  error107,
  error108,
  error109,
  error110,
  error111,
  error112,
  error113,
  error114,
  error115,
  error116,
  error117,
  error118,
  error119,
  error120,
  error121,
  error122,
  error123,
  error124,
  error125,
  error126,
  error127,
  error128,
  error129,
  error130,
  error131,
  error132,
  error133,
  error134,
  error135,
  error136,
  error137,
  error138,
  error139,
  error140,
  error141,
  error142,
  error143,
  error144,
  error145,
  error146,
  error147,
  error148,
  error149,
  error150,
  error151,
  error152,
  error153,
  error154,
  error155,
  error156,
  error157,
  error158,
  error159,
  error160,
  error161,
  error162,
  error163,
  error164,
  error165,
  error166,
  error167,
  error168,
  error169,
  error170,
  error171,
  error172,
  error173,
  error174,
  error175,
  error176,
  error177,
  error178,
  error179,
  error180,
  error181,
  error182,
  error183,
  error184,
  error185,
  error186,
  error187,
  error188,
  error189,
  error190,
  error191,
  error192,
  error193,
  error194,
  error195,
  error196,
  error197,
  error198,
  error199,
] as const;

const channel0Params: InferChannelParams<typeof api.channels.channel0> = { roomId: "room-0" };
const channel0 = client.channels.channel0(channel0Params);
export const channel0Status: ChannelStatus = channel0.status;
export const channel0Created = channel0.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel0, "created"> = event;
  void value;
});
export const channel0Updated = channel0.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel0, "updated"> = event;
  void value;
});
export const channel0Deleted = channel0.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel0, "deleted"> = event;
  void value;
});
export const channel0Typing = channel0.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel0, "typing"> = event;
  void value;
});
export const channel0Send: Promise<void> = channel0.send(
  { text: "message-0", nonce: 0 },
  { ack: true },
);
channel0.edit({ id: "item-0", text: "edited-0", nonce: 0 });
channel0.remove({ id: "item-0", nonce: 0 });
export const channel0SendError: InferClientEventErrors<typeof api.channels.channel0, "send"> = {
  code: "MUTED",
  data: { until: 0 },
};
export const channel0EditError: InferClientEventErrors<typeof api.channels.channel0, "edit"> = {
  code: "CONFLICT",
  data: { version: 0 },
};
export const channel0RemoveError: InferClientEventErrors<typeof api.channels.channel0, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-0" },
};
export const channel0Load: Promise<
  InferOutput<(typeof api.channels.channel0)["procedures"]["load"]>
> = channel0.load({ cursor: 0, channel: 0 });
export const channel0LoadError: InferErrors<(typeof api.channels.channel0)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-0" },
  };
export const channel0Moderate: Promise<
  InferOutput<(typeof api.channels.channel0)["procedures"]["moderate"]>
> = channel0.moderate({ userId: "user-0", channel: 0 });
export const channel0ModerateError: InferErrors<
  (typeof api.channels.channel0)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-0" },
};
channel0.presence.update({ typing: true, channel: 0 });
export const channel0Presence: InferPresence<typeof api.channels.channel0> | undefined =
  channel0.presence.self;
export const channel0Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel0>
>[] = channel0.presence.others;
export const channel0PresenceOff = channel0.presence.on(() => undefined);
export const channel0Dispose = (): void => {
  channel0.dispose();
};

const channel1Params: InferChannelParams<typeof api.channels.channel1> = { roomId: "room-1" };
const channel1 = client.channels.channel1(channel1Params);
export const channel1Status: ChannelStatus = channel1.status;
export const channel1Created = channel1.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel1, "created"> = event;
  void value;
});
export const channel1Updated = channel1.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel1, "updated"> = event;
  void value;
});
export const channel1Deleted = channel1.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel1, "deleted"> = event;
  void value;
});
export const channel1Typing = channel1.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel1, "typing"> = event;
  void value;
});
export const channel1Send: Promise<void> = channel1.send(
  { text: "message-1", nonce: 1 },
  { ack: true },
);
channel1.edit({ id: "item-1", text: "edited-1", nonce: 1 });
channel1.remove({ id: "item-1", nonce: 1 });
export const channel1SendError: InferClientEventErrors<typeof api.channels.channel1, "send"> = {
  code: "MUTED",
  data: { until: 1 },
};
export const channel1EditError: InferClientEventErrors<typeof api.channels.channel1, "edit"> = {
  code: "CONFLICT",
  data: { version: 1 },
};
export const channel1RemoveError: InferClientEventErrors<typeof api.channels.channel1, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-1" },
};
export const channel1Load: Promise<
  InferOutput<(typeof api.channels.channel1)["procedures"]["load"]>
> = channel1.load({ cursor: 1, channel: 1 });
export const channel1LoadError: InferErrors<(typeof api.channels.channel1)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-1" },
  };
export const channel1Moderate: Promise<
  InferOutput<(typeof api.channels.channel1)["procedures"]["moderate"]>
> = channel1.moderate({ userId: "user-1", channel: 1 });
export const channel1ModerateError: InferErrors<
  (typeof api.channels.channel1)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-1" },
};
channel1.presence.update({ typing: true, channel: 1 });
export const channel1Presence: InferPresence<typeof api.channels.channel1> | undefined =
  channel1.presence.self;
export const channel1Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel1>
>[] = channel1.presence.others;
export const channel1PresenceOff = channel1.presence.on(() => undefined);
export const channel1Dispose = (): void => {
  channel1.dispose();
};

const channel2Params: InferChannelParams<typeof api.channels.channel2> = { roomId: "room-2" };
const channel2 = client.channels.channel2(channel2Params);
export const channel2Status: ChannelStatus = channel2.status;
export const channel2Created = channel2.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel2, "created"> = event;
  void value;
});
export const channel2Updated = channel2.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel2, "updated"> = event;
  void value;
});
export const channel2Deleted = channel2.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel2, "deleted"> = event;
  void value;
});
export const channel2Typing = channel2.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel2, "typing"> = event;
  void value;
});
export const channel2Send: Promise<void> = channel2.send(
  { text: "message-2", nonce: 2 },
  { ack: true },
);
channel2.edit({ id: "item-2", text: "edited-2", nonce: 2 });
channel2.remove({ id: "item-2", nonce: 2 });
export const channel2SendError: InferClientEventErrors<typeof api.channels.channel2, "send"> = {
  code: "MUTED",
  data: { until: 2 },
};
export const channel2EditError: InferClientEventErrors<typeof api.channels.channel2, "edit"> = {
  code: "CONFLICT",
  data: { version: 2 },
};
export const channel2RemoveError: InferClientEventErrors<typeof api.channels.channel2, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-2" },
};
export const channel2Load: Promise<
  InferOutput<(typeof api.channels.channel2)["procedures"]["load"]>
> = channel2.load({ cursor: 2, channel: 2 });
export const channel2LoadError: InferErrors<(typeof api.channels.channel2)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-2" },
  };
export const channel2Moderate: Promise<
  InferOutput<(typeof api.channels.channel2)["procedures"]["moderate"]>
> = channel2.moderate({ userId: "user-2", channel: 2 });
export const channel2ModerateError: InferErrors<
  (typeof api.channels.channel2)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-2" },
};
channel2.presence.update({ typing: true, channel: 2 });
export const channel2Presence: InferPresence<typeof api.channels.channel2> | undefined =
  channel2.presence.self;
export const channel2Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel2>
>[] = channel2.presence.others;
export const channel2PresenceOff = channel2.presence.on(() => undefined);
export const channel2Dispose = (): void => {
  channel2.dispose();
};

const channel3Params: InferChannelParams<typeof api.channels.channel3> = { roomId: "room-3" };
const channel3 = client.channels.channel3(channel3Params);
export const channel3Status: ChannelStatus = channel3.status;
export const channel3Created = channel3.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel3, "created"> = event;
  void value;
});
export const channel3Updated = channel3.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel3, "updated"> = event;
  void value;
});
export const channel3Deleted = channel3.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel3, "deleted"> = event;
  void value;
});
export const channel3Typing = channel3.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel3, "typing"> = event;
  void value;
});
export const channel3Send: Promise<void> = channel3.send(
  { text: "message-3", nonce: 3 },
  { ack: true },
);
channel3.edit({ id: "item-3", text: "edited-3", nonce: 3 });
channel3.remove({ id: "item-3", nonce: 3 });
export const channel3SendError: InferClientEventErrors<typeof api.channels.channel3, "send"> = {
  code: "MUTED",
  data: { until: 3 },
};
export const channel3EditError: InferClientEventErrors<typeof api.channels.channel3, "edit"> = {
  code: "CONFLICT",
  data: { version: 3 },
};
export const channel3RemoveError: InferClientEventErrors<typeof api.channels.channel3, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-3" },
};
export const channel3Load: Promise<
  InferOutput<(typeof api.channels.channel3)["procedures"]["load"]>
> = channel3.load({ cursor: 3, channel: 3 });
export const channel3LoadError: InferErrors<(typeof api.channels.channel3)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-3" },
  };
export const channel3Moderate: Promise<
  InferOutput<(typeof api.channels.channel3)["procedures"]["moderate"]>
> = channel3.moderate({ userId: "user-3", channel: 3 });
export const channel3ModerateError: InferErrors<
  (typeof api.channels.channel3)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-3" },
};
channel3.presence.update({ typing: true, channel: 3 });
export const channel3Presence: InferPresence<typeof api.channels.channel3> | undefined =
  channel3.presence.self;
export const channel3Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel3>
>[] = channel3.presence.others;
export const channel3PresenceOff = channel3.presence.on(() => undefined);
export const channel3Dispose = (): void => {
  channel3.dispose();
};

const channel4Params: InferChannelParams<typeof api.channels.channel4> = { roomId: "room-4" };
const channel4 = client.channels.channel4(channel4Params);
export const channel4Status: ChannelStatus = channel4.status;
export const channel4Created = channel4.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel4, "created"> = event;
  void value;
});
export const channel4Updated = channel4.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel4, "updated"> = event;
  void value;
});
export const channel4Deleted = channel4.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel4, "deleted"> = event;
  void value;
});
export const channel4Typing = channel4.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel4, "typing"> = event;
  void value;
});
export const channel4Send: Promise<void> = channel4.send(
  { text: "message-4", nonce: 4 },
  { ack: true },
);
channel4.edit({ id: "item-4", text: "edited-4", nonce: 4 });
channel4.remove({ id: "item-4", nonce: 4 });
export const channel4SendError: InferClientEventErrors<typeof api.channels.channel4, "send"> = {
  code: "MUTED",
  data: { until: 4 },
};
export const channel4EditError: InferClientEventErrors<typeof api.channels.channel4, "edit"> = {
  code: "CONFLICT",
  data: { version: 4 },
};
export const channel4RemoveError: InferClientEventErrors<typeof api.channels.channel4, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-4" },
};
export const channel4Load: Promise<
  InferOutput<(typeof api.channels.channel4)["procedures"]["load"]>
> = channel4.load({ cursor: 4, channel: 4 });
export const channel4LoadError: InferErrors<(typeof api.channels.channel4)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-4" },
  };
export const channel4Moderate: Promise<
  InferOutput<(typeof api.channels.channel4)["procedures"]["moderate"]>
> = channel4.moderate({ userId: "user-4", channel: 4 });
export const channel4ModerateError: InferErrors<
  (typeof api.channels.channel4)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-4" },
};
channel4.presence.update({ typing: true, channel: 4 });
export const channel4Presence: InferPresence<typeof api.channels.channel4> | undefined =
  channel4.presence.self;
export const channel4Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel4>
>[] = channel4.presence.others;
export const channel4PresenceOff = channel4.presence.on(() => undefined);
export const channel4Dispose = (): void => {
  channel4.dispose();
};

const channel5Params: InferChannelParams<typeof api.channels.channel5> = { roomId: "room-5" };
const channel5 = client.channels.channel5(channel5Params);
export const channel5Status: ChannelStatus = channel5.status;
export const channel5Created = channel5.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel5, "created"> = event;
  void value;
});
export const channel5Updated = channel5.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel5, "updated"> = event;
  void value;
});
export const channel5Deleted = channel5.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel5, "deleted"> = event;
  void value;
});
export const channel5Typing = channel5.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel5, "typing"> = event;
  void value;
});
export const channel5Send: Promise<void> = channel5.send(
  { text: "message-5", nonce: 5 },
  { ack: true },
);
channel5.edit({ id: "item-5", text: "edited-5", nonce: 5 });
channel5.remove({ id: "item-5", nonce: 5 });
export const channel5SendError: InferClientEventErrors<typeof api.channels.channel5, "send"> = {
  code: "MUTED",
  data: { until: 5 },
};
export const channel5EditError: InferClientEventErrors<typeof api.channels.channel5, "edit"> = {
  code: "CONFLICT",
  data: { version: 5 },
};
export const channel5RemoveError: InferClientEventErrors<typeof api.channels.channel5, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-5" },
};
export const channel5Load: Promise<
  InferOutput<(typeof api.channels.channel5)["procedures"]["load"]>
> = channel5.load({ cursor: 5, channel: 5 });
export const channel5LoadError: InferErrors<(typeof api.channels.channel5)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-5" },
  };
export const channel5Moderate: Promise<
  InferOutput<(typeof api.channels.channel5)["procedures"]["moderate"]>
> = channel5.moderate({ userId: "user-5", channel: 5 });
export const channel5ModerateError: InferErrors<
  (typeof api.channels.channel5)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-5" },
};
channel5.presence.update({ typing: true, channel: 5 });
export const channel5Presence: InferPresence<typeof api.channels.channel5> | undefined =
  channel5.presence.self;
export const channel5Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel5>
>[] = channel5.presence.others;
export const channel5PresenceOff = channel5.presence.on(() => undefined);
export const channel5Dispose = (): void => {
  channel5.dispose();
};

const channel6Params: InferChannelParams<typeof api.channels.channel6> = { roomId: "room-6" };
const channel6 = client.channels.channel6(channel6Params);
export const channel6Status: ChannelStatus = channel6.status;
export const channel6Created = channel6.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel6, "created"> = event;
  void value;
});
export const channel6Updated = channel6.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel6, "updated"> = event;
  void value;
});
export const channel6Deleted = channel6.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel6, "deleted"> = event;
  void value;
});
export const channel6Typing = channel6.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel6, "typing"> = event;
  void value;
});
export const channel6Send: Promise<void> = channel6.send(
  { text: "message-6", nonce: 6 },
  { ack: true },
);
channel6.edit({ id: "item-6", text: "edited-6", nonce: 6 });
channel6.remove({ id: "item-6", nonce: 6 });
export const channel6SendError: InferClientEventErrors<typeof api.channels.channel6, "send"> = {
  code: "MUTED",
  data: { until: 6 },
};
export const channel6EditError: InferClientEventErrors<typeof api.channels.channel6, "edit"> = {
  code: "CONFLICT",
  data: { version: 6 },
};
export const channel6RemoveError: InferClientEventErrors<typeof api.channels.channel6, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-6" },
};
export const channel6Load: Promise<
  InferOutput<(typeof api.channels.channel6)["procedures"]["load"]>
> = channel6.load({ cursor: 6, channel: 6 });
export const channel6LoadError: InferErrors<(typeof api.channels.channel6)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-6" },
  };
export const channel6Moderate: Promise<
  InferOutput<(typeof api.channels.channel6)["procedures"]["moderate"]>
> = channel6.moderate({ userId: "user-6", channel: 6 });
export const channel6ModerateError: InferErrors<
  (typeof api.channels.channel6)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-6" },
};
channel6.presence.update({ typing: true, channel: 6 });
export const channel6Presence: InferPresence<typeof api.channels.channel6> | undefined =
  channel6.presence.self;
export const channel6Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel6>
>[] = channel6.presence.others;
export const channel6PresenceOff = channel6.presence.on(() => undefined);
export const channel6Dispose = (): void => {
  channel6.dispose();
};

const channel7Params: InferChannelParams<typeof api.channels.channel7> = { roomId: "room-7" };
const channel7 = client.channels.channel7(channel7Params);
export const channel7Status: ChannelStatus = channel7.status;
export const channel7Created = channel7.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel7, "created"> = event;
  void value;
});
export const channel7Updated = channel7.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel7, "updated"> = event;
  void value;
});
export const channel7Deleted = channel7.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel7, "deleted"> = event;
  void value;
});
export const channel7Typing = channel7.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel7, "typing"> = event;
  void value;
});
export const channel7Send: Promise<void> = channel7.send(
  { text: "message-7", nonce: 7 },
  { ack: true },
);
channel7.edit({ id: "item-7", text: "edited-7", nonce: 7 });
channel7.remove({ id: "item-7", nonce: 7 });
export const channel7SendError: InferClientEventErrors<typeof api.channels.channel7, "send"> = {
  code: "MUTED",
  data: { until: 7 },
};
export const channel7EditError: InferClientEventErrors<typeof api.channels.channel7, "edit"> = {
  code: "CONFLICT",
  data: { version: 7 },
};
export const channel7RemoveError: InferClientEventErrors<typeof api.channels.channel7, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-7" },
};
export const channel7Load: Promise<
  InferOutput<(typeof api.channels.channel7)["procedures"]["load"]>
> = channel7.load({ cursor: 7, channel: 7 });
export const channel7LoadError: InferErrors<(typeof api.channels.channel7)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-7" },
  };
export const channel7Moderate: Promise<
  InferOutput<(typeof api.channels.channel7)["procedures"]["moderate"]>
> = channel7.moderate({ userId: "user-7", channel: 7 });
export const channel7ModerateError: InferErrors<
  (typeof api.channels.channel7)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-7" },
};
channel7.presence.update({ typing: true, channel: 7 });
export const channel7Presence: InferPresence<typeof api.channels.channel7> | undefined =
  channel7.presence.self;
export const channel7Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel7>
>[] = channel7.presence.others;
export const channel7PresenceOff = channel7.presence.on(() => undefined);
export const channel7Dispose = (): void => {
  channel7.dispose();
};

const channel8Params: InferChannelParams<typeof api.channels.channel8> = { roomId: "room-8" };
const channel8 = client.channels.channel8(channel8Params);
export const channel8Status: ChannelStatus = channel8.status;
export const channel8Created = channel8.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel8, "created"> = event;
  void value;
});
export const channel8Updated = channel8.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel8, "updated"> = event;
  void value;
});
export const channel8Deleted = channel8.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel8, "deleted"> = event;
  void value;
});
export const channel8Typing = channel8.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel8, "typing"> = event;
  void value;
});
export const channel8Send: Promise<void> = channel8.send(
  { text: "message-8", nonce: 8 },
  { ack: true },
);
channel8.edit({ id: "item-8", text: "edited-8", nonce: 8 });
channel8.remove({ id: "item-8", nonce: 8 });
export const channel8SendError: InferClientEventErrors<typeof api.channels.channel8, "send"> = {
  code: "MUTED",
  data: { until: 8 },
};
export const channel8EditError: InferClientEventErrors<typeof api.channels.channel8, "edit"> = {
  code: "CONFLICT",
  data: { version: 8 },
};
export const channel8RemoveError: InferClientEventErrors<typeof api.channels.channel8, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-8" },
};
export const channel8Load: Promise<
  InferOutput<(typeof api.channels.channel8)["procedures"]["load"]>
> = channel8.load({ cursor: 8, channel: 8 });
export const channel8LoadError: InferErrors<(typeof api.channels.channel8)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-8" },
  };
export const channel8Moderate: Promise<
  InferOutput<(typeof api.channels.channel8)["procedures"]["moderate"]>
> = channel8.moderate({ userId: "user-8", channel: 8 });
export const channel8ModerateError: InferErrors<
  (typeof api.channels.channel8)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-8" },
};
channel8.presence.update({ typing: true, channel: 8 });
export const channel8Presence: InferPresence<typeof api.channels.channel8> | undefined =
  channel8.presence.self;
export const channel8Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel8>
>[] = channel8.presence.others;
export const channel8PresenceOff = channel8.presence.on(() => undefined);
export const channel8Dispose = (): void => {
  channel8.dispose();
};

const channel9Params: InferChannelParams<typeof api.channels.channel9> = { roomId: "room-9" };
const channel9 = client.channels.channel9(channel9Params);
export const channel9Status: ChannelStatus = channel9.status;
export const channel9Created = channel9.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel9, "created"> = event;
  void value;
});
export const channel9Updated = channel9.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel9, "updated"> = event;
  void value;
});
export const channel9Deleted = channel9.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel9, "deleted"> = event;
  void value;
});
export const channel9Typing = channel9.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel9, "typing"> = event;
  void value;
});
export const channel9Send: Promise<void> = channel9.send(
  { text: "message-9", nonce: 9 },
  { ack: true },
);
channel9.edit({ id: "item-9", text: "edited-9", nonce: 9 });
channel9.remove({ id: "item-9", nonce: 9 });
export const channel9SendError: InferClientEventErrors<typeof api.channels.channel9, "send"> = {
  code: "MUTED",
  data: { until: 9 },
};
export const channel9EditError: InferClientEventErrors<typeof api.channels.channel9, "edit"> = {
  code: "CONFLICT",
  data: { version: 9 },
};
export const channel9RemoveError: InferClientEventErrors<typeof api.channels.channel9, "remove"> = {
  code: "FORBIDDEN",
  data: { reason: "channel-9" },
};
export const channel9Load: Promise<
  InferOutput<(typeof api.channels.channel9)["procedures"]["load"]>
> = channel9.load({ cursor: 9, channel: 9 });
export const channel9LoadError: InferErrors<(typeof api.channels.channel9)["procedures"]["load"]> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-9" },
  };
export const channel9Moderate: Promise<
  InferOutput<(typeof api.channels.channel9)["procedures"]["moderate"]>
> = channel9.moderate({ userId: "user-9", channel: 9 });
export const channel9ModerateError: InferErrors<
  (typeof api.channels.channel9)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-9" },
};
channel9.presence.update({ typing: true, channel: 9 });
export const channel9Presence: InferPresence<typeof api.channels.channel9> | undefined =
  channel9.presence.self;
export const channel9Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel9>
>[] = channel9.presence.others;
export const channel9PresenceOff = channel9.presence.on(() => undefined);
export const channel9Dispose = (): void => {
  channel9.dispose();
};

const channel10Params: InferChannelParams<typeof api.channels.channel10> = { roomId: "room-10" };
const channel10 = client.channels.channel10(channel10Params);
export const channel10Status: ChannelStatus = channel10.status;
export const channel10Created = channel10.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel10, "created"> = event;
  void value;
});
export const channel10Updated = channel10.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel10, "updated"> = event;
  void value;
});
export const channel10Deleted = channel10.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel10, "deleted"> = event;
  void value;
});
export const channel10Typing = channel10.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel10, "typing"> = event;
  void value;
});
export const channel10Send: Promise<void> = channel10.send(
  { text: "message-10", nonce: 10 },
  { ack: true },
);
channel10.edit({ id: "item-10", text: "edited-10", nonce: 10 });
channel10.remove({ id: "item-10", nonce: 10 });
export const channel10SendError: InferClientEventErrors<typeof api.channels.channel10, "send"> = {
  code: "MUTED",
  data: { until: 10 },
};
export const channel10EditError: InferClientEventErrors<typeof api.channels.channel10, "edit"> = {
  code: "CONFLICT",
  data: { version: 10 },
};
export const channel10RemoveError: InferClientEventErrors<typeof api.channels.channel10, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-10" },
  };
export const channel10Load: Promise<
  InferOutput<(typeof api.channels.channel10)["procedures"]["load"]>
> = channel10.load({ cursor: 10, channel: 10 });
export const channel10LoadError: InferErrors<
  (typeof api.channels.channel10)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-10" },
};
export const channel10Moderate: Promise<
  InferOutput<(typeof api.channels.channel10)["procedures"]["moderate"]>
> = channel10.moderate({ userId: "user-10", channel: 10 });
export const channel10ModerateError: InferErrors<
  (typeof api.channels.channel10)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-10" },
};
channel10.presence.update({ typing: true, channel: 10 });
export const channel10Presence: InferPresence<typeof api.channels.channel10> | undefined =
  channel10.presence.self;
export const channel10Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel10>
>[] = channel10.presence.others;
export const channel10PresenceOff = channel10.presence.on(() => undefined);
export const channel10Dispose = (): void => {
  channel10.dispose();
};

const channel11Params: InferChannelParams<typeof api.channels.channel11> = { roomId: "room-11" };
const channel11 = client.channels.channel11(channel11Params);
export const channel11Status: ChannelStatus = channel11.status;
export const channel11Created = channel11.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel11, "created"> = event;
  void value;
});
export const channel11Updated = channel11.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel11, "updated"> = event;
  void value;
});
export const channel11Deleted = channel11.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel11, "deleted"> = event;
  void value;
});
export const channel11Typing = channel11.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel11, "typing"> = event;
  void value;
});
export const channel11Send: Promise<void> = channel11.send(
  { text: "message-11", nonce: 11 },
  { ack: true },
);
channel11.edit({ id: "item-11", text: "edited-11", nonce: 11 });
channel11.remove({ id: "item-11", nonce: 11 });
export const channel11SendError: InferClientEventErrors<typeof api.channels.channel11, "send"> = {
  code: "MUTED",
  data: { until: 11 },
};
export const channel11EditError: InferClientEventErrors<typeof api.channels.channel11, "edit"> = {
  code: "CONFLICT",
  data: { version: 11 },
};
export const channel11RemoveError: InferClientEventErrors<typeof api.channels.channel11, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-11" },
  };
export const channel11Load: Promise<
  InferOutput<(typeof api.channels.channel11)["procedures"]["load"]>
> = channel11.load({ cursor: 11, channel: 11 });
export const channel11LoadError: InferErrors<
  (typeof api.channels.channel11)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-11" },
};
export const channel11Moderate: Promise<
  InferOutput<(typeof api.channels.channel11)["procedures"]["moderate"]>
> = channel11.moderate({ userId: "user-11", channel: 11 });
export const channel11ModerateError: InferErrors<
  (typeof api.channels.channel11)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-11" },
};
channel11.presence.update({ typing: true, channel: 11 });
export const channel11Presence: InferPresence<typeof api.channels.channel11> | undefined =
  channel11.presence.self;
export const channel11Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel11>
>[] = channel11.presence.others;
export const channel11PresenceOff = channel11.presence.on(() => undefined);
export const channel11Dispose = (): void => {
  channel11.dispose();
};

const channel12Params: InferChannelParams<typeof api.channels.channel12> = { roomId: "room-12" };
const channel12 = client.channels.channel12(channel12Params);
export const channel12Status: ChannelStatus = channel12.status;
export const channel12Created = channel12.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel12, "created"> = event;
  void value;
});
export const channel12Updated = channel12.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel12, "updated"> = event;
  void value;
});
export const channel12Deleted = channel12.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel12, "deleted"> = event;
  void value;
});
export const channel12Typing = channel12.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel12, "typing"> = event;
  void value;
});
export const channel12Send: Promise<void> = channel12.send(
  { text: "message-12", nonce: 12 },
  { ack: true },
);
channel12.edit({ id: "item-12", text: "edited-12", nonce: 12 });
channel12.remove({ id: "item-12", nonce: 12 });
export const channel12SendError: InferClientEventErrors<typeof api.channels.channel12, "send"> = {
  code: "MUTED",
  data: { until: 12 },
};
export const channel12EditError: InferClientEventErrors<typeof api.channels.channel12, "edit"> = {
  code: "CONFLICT",
  data: { version: 12 },
};
export const channel12RemoveError: InferClientEventErrors<typeof api.channels.channel12, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-12" },
  };
export const channel12Load: Promise<
  InferOutput<(typeof api.channels.channel12)["procedures"]["load"]>
> = channel12.load({ cursor: 12, channel: 12 });
export const channel12LoadError: InferErrors<
  (typeof api.channels.channel12)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-12" },
};
export const channel12Moderate: Promise<
  InferOutput<(typeof api.channels.channel12)["procedures"]["moderate"]>
> = channel12.moderate({ userId: "user-12", channel: 12 });
export const channel12ModerateError: InferErrors<
  (typeof api.channels.channel12)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-12" },
};
channel12.presence.update({ typing: true, channel: 12 });
export const channel12Presence: InferPresence<typeof api.channels.channel12> | undefined =
  channel12.presence.self;
export const channel12Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel12>
>[] = channel12.presence.others;
export const channel12PresenceOff = channel12.presence.on(() => undefined);
export const channel12Dispose = (): void => {
  channel12.dispose();
};

const channel13Params: InferChannelParams<typeof api.channels.channel13> = { roomId: "room-13" };
const channel13 = client.channels.channel13(channel13Params);
export const channel13Status: ChannelStatus = channel13.status;
export const channel13Created = channel13.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel13, "created"> = event;
  void value;
});
export const channel13Updated = channel13.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel13, "updated"> = event;
  void value;
});
export const channel13Deleted = channel13.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel13, "deleted"> = event;
  void value;
});
export const channel13Typing = channel13.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel13, "typing"> = event;
  void value;
});
export const channel13Send: Promise<void> = channel13.send(
  { text: "message-13", nonce: 13 },
  { ack: true },
);
channel13.edit({ id: "item-13", text: "edited-13", nonce: 13 });
channel13.remove({ id: "item-13", nonce: 13 });
export const channel13SendError: InferClientEventErrors<typeof api.channels.channel13, "send"> = {
  code: "MUTED",
  data: { until: 13 },
};
export const channel13EditError: InferClientEventErrors<typeof api.channels.channel13, "edit"> = {
  code: "CONFLICT",
  data: { version: 13 },
};
export const channel13RemoveError: InferClientEventErrors<typeof api.channels.channel13, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-13" },
  };
export const channel13Load: Promise<
  InferOutput<(typeof api.channels.channel13)["procedures"]["load"]>
> = channel13.load({ cursor: 13, channel: 13 });
export const channel13LoadError: InferErrors<
  (typeof api.channels.channel13)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-13" },
};
export const channel13Moderate: Promise<
  InferOutput<(typeof api.channels.channel13)["procedures"]["moderate"]>
> = channel13.moderate({ userId: "user-13", channel: 13 });
export const channel13ModerateError: InferErrors<
  (typeof api.channels.channel13)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-13" },
};
channel13.presence.update({ typing: true, channel: 13 });
export const channel13Presence: InferPresence<typeof api.channels.channel13> | undefined =
  channel13.presence.self;
export const channel13Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel13>
>[] = channel13.presence.others;
export const channel13PresenceOff = channel13.presence.on(() => undefined);
export const channel13Dispose = (): void => {
  channel13.dispose();
};

const channel14Params: InferChannelParams<typeof api.channels.channel14> = { roomId: "room-14" };
const channel14 = client.channels.channel14(channel14Params);
export const channel14Status: ChannelStatus = channel14.status;
export const channel14Created = channel14.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel14, "created"> = event;
  void value;
});
export const channel14Updated = channel14.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel14, "updated"> = event;
  void value;
});
export const channel14Deleted = channel14.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel14, "deleted"> = event;
  void value;
});
export const channel14Typing = channel14.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel14, "typing"> = event;
  void value;
});
export const channel14Send: Promise<void> = channel14.send(
  { text: "message-14", nonce: 14 },
  { ack: true },
);
channel14.edit({ id: "item-14", text: "edited-14", nonce: 14 });
channel14.remove({ id: "item-14", nonce: 14 });
export const channel14SendError: InferClientEventErrors<typeof api.channels.channel14, "send"> = {
  code: "MUTED",
  data: { until: 14 },
};
export const channel14EditError: InferClientEventErrors<typeof api.channels.channel14, "edit"> = {
  code: "CONFLICT",
  data: { version: 14 },
};
export const channel14RemoveError: InferClientEventErrors<typeof api.channels.channel14, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-14" },
  };
export const channel14Load: Promise<
  InferOutput<(typeof api.channels.channel14)["procedures"]["load"]>
> = channel14.load({ cursor: 14, channel: 14 });
export const channel14LoadError: InferErrors<
  (typeof api.channels.channel14)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-14" },
};
export const channel14Moderate: Promise<
  InferOutput<(typeof api.channels.channel14)["procedures"]["moderate"]>
> = channel14.moderate({ userId: "user-14", channel: 14 });
export const channel14ModerateError: InferErrors<
  (typeof api.channels.channel14)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-14" },
};
channel14.presence.update({ typing: true, channel: 14 });
export const channel14Presence: InferPresence<typeof api.channels.channel14> | undefined =
  channel14.presence.self;
export const channel14Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel14>
>[] = channel14.presence.others;
export const channel14PresenceOff = channel14.presence.on(() => undefined);
export const channel14Dispose = (): void => {
  channel14.dispose();
};

const channel15Params: InferChannelParams<typeof api.channels.channel15> = { roomId: "room-15" };
const channel15 = client.channels.channel15(channel15Params);
export const channel15Status: ChannelStatus = channel15.status;
export const channel15Created = channel15.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel15, "created"> = event;
  void value;
});
export const channel15Updated = channel15.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel15, "updated"> = event;
  void value;
});
export const channel15Deleted = channel15.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel15, "deleted"> = event;
  void value;
});
export const channel15Typing = channel15.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel15, "typing"> = event;
  void value;
});
export const channel15Send: Promise<void> = channel15.send(
  { text: "message-15", nonce: 15 },
  { ack: true },
);
channel15.edit({ id: "item-15", text: "edited-15", nonce: 15 });
channel15.remove({ id: "item-15", nonce: 15 });
export const channel15SendError: InferClientEventErrors<typeof api.channels.channel15, "send"> = {
  code: "MUTED",
  data: { until: 15 },
};
export const channel15EditError: InferClientEventErrors<typeof api.channels.channel15, "edit"> = {
  code: "CONFLICT",
  data: { version: 15 },
};
export const channel15RemoveError: InferClientEventErrors<typeof api.channels.channel15, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-15" },
  };
export const channel15Load: Promise<
  InferOutput<(typeof api.channels.channel15)["procedures"]["load"]>
> = channel15.load({ cursor: 15, channel: 15 });
export const channel15LoadError: InferErrors<
  (typeof api.channels.channel15)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-15" },
};
export const channel15Moderate: Promise<
  InferOutput<(typeof api.channels.channel15)["procedures"]["moderate"]>
> = channel15.moderate({ userId: "user-15", channel: 15 });
export const channel15ModerateError: InferErrors<
  (typeof api.channels.channel15)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-15" },
};
channel15.presence.update({ typing: true, channel: 15 });
export const channel15Presence: InferPresence<typeof api.channels.channel15> | undefined =
  channel15.presence.self;
export const channel15Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel15>
>[] = channel15.presence.others;
export const channel15PresenceOff = channel15.presence.on(() => undefined);
export const channel15Dispose = (): void => {
  channel15.dispose();
};

const channel16Params: InferChannelParams<typeof api.channels.channel16> = { roomId: "room-16" };
const channel16 = client.channels.channel16(channel16Params);
export const channel16Status: ChannelStatus = channel16.status;
export const channel16Created = channel16.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel16, "created"> = event;
  void value;
});
export const channel16Updated = channel16.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel16, "updated"> = event;
  void value;
});
export const channel16Deleted = channel16.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel16, "deleted"> = event;
  void value;
});
export const channel16Typing = channel16.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel16, "typing"> = event;
  void value;
});
export const channel16Send: Promise<void> = channel16.send(
  { text: "message-16", nonce: 16 },
  { ack: true },
);
channel16.edit({ id: "item-16", text: "edited-16", nonce: 16 });
channel16.remove({ id: "item-16", nonce: 16 });
export const channel16SendError: InferClientEventErrors<typeof api.channels.channel16, "send"> = {
  code: "MUTED",
  data: { until: 16 },
};
export const channel16EditError: InferClientEventErrors<typeof api.channels.channel16, "edit"> = {
  code: "CONFLICT",
  data: { version: 16 },
};
export const channel16RemoveError: InferClientEventErrors<typeof api.channels.channel16, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-16" },
  };
export const channel16Load: Promise<
  InferOutput<(typeof api.channels.channel16)["procedures"]["load"]>
> = channel16.load({ cursor: 16, channel: 16 });
export const channel16LoadError: InferErrors<
  (typeof api.channels.channel16)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-16" },
};
export const channel16Moderate: Promise<
  InferOutput<(typeof api.channels.channel16)["procedures"]["moderate"]>
> = channel16.moderate({ userId: "user-16", channel: 16 });
export const channel16ModerateError: InferErrors<
  (typeof api.channels.channel16)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-16" },
};
channel16.presence.update({ typing: true, channel: 16 });
export const channel16Presence: InferPresence<typeof api.channels.channel16> | undefined =
  channel16.presence.self;
export const channel16Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel16>
>[] = channel16.presence.others;
export const channel16PresenceOff = channel16.presence.on(() => undefined);
export const channel16Dispose = (): void => {
  channel16.dispose();
};

const channel17Params: InferChannelParams<typeof api.channels.channel17> = { roomId: "room-17" };
const channel17 = client.channels.channel17(channel17Params);
export const channel17Status: ChannelStatus = channel17.status;
export const channel17Created = channel17.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel17, "created"> = event;
  void value;
});
export const channel17Updated = channel17.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel17, "updated"> = event;
  void value;
});
export const channel17Deleted = channel17.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel17, "deleted"> = event;
  void value;
});
export const channel17Typing = channel17.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel17, "typing"> = event;
  void value;
});
export const channel17Send: Promise<void> = channel17.send(
  { text: "message-17", nonce: 17 },
  { ack: true },
);
channel17.edit({ id: "item-17", text: "edited-17", nonce: 17 });
channel17.remove({ id: "item-17", nonce: 17 });
export const channel17SendError: InferClientEventErrors<typeof api.channels.channel17, "send"> = {
  code: "MUTED",
  data: { until: 17 },
};
export const channel17EditError: InferClientEventErrors<typeof api.channels.channel17, "edit"> = {
  code: "CONFLICT",
  data: { version: 17 },
};
export const channel17RemoveError: InferClientEventErrors<typeof api.channels.channel17, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-17" },
  };
export const channel17Load: Promise<
  InferOutput<(typeof api.channels.channel17)["procedures"]["load"]>
> = channel17.load({ cursor: 17, channel: 17 });
export const channel17LoadError: InferErrors<
  (typeof api.channels.channel17)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-17" },
};
export const channel17Moderate: Promise<
  InferOutput<(typeof api.channels.channel17)["procedures"]["moderate"]>
> = channel17.moderate({ userId: "user-17", channel: 17 });
export const channel17ModerateError: InferErrors<
  (typeof api.channels.channel17)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-17" },
};
channel17.presence.update({ typing: true, channel: 17 });
export const channel17Presence: InferPresence<typeof api.channels.channel17> | undefined =
  channel17.presence.self;
export const channel17Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel17>
>[] = channel17.presence.others;
export const channel17PresenceOff = channel17.presence.on(() => undefined);
export const channel17Dispose = (): void => {
  channel17.dispose();
};

const channel18Params: InferChannelParams<typeof api.channels.channel18> = { roomId: "room-18" };
const channel18 = client.channels.channel18(channel18Params);
export const channel18Status: ChannelStatus = channel18.status;
export const channel18Created = channel18.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel18, "created"> = event;
  void value;
});
export const channel18Updated = channel18.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel18, "updated"> = event;
  void value;
});
export const channel18Deleted = channel18.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel18, "deleted"> = event;
  void value;
});
export const channel18Typing = channel18.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel18, "typing"> = event;
  void value;
});
export const channel18Send: Promise<void> = channel18.send(
  { text: "message-18", nonce: 18 },
  { ack: true },
);
channel18.edit({ id: "item-18", text: "edited-18", nonce: 18 });
channel18.remove({ id: "item-18", nonce: 18 });
export const channel18SendError: InferClientEventErrors<typeof api.channels.channel18, "send"> = {
  code: "MUTED",
  data: { until: 18 },
};
export const channel18EditError: InferClientEventErrors<typeof api.channels.channel18, "edit"> = {
  code: "CONFLICT",
  data: { version: 18 },
};
export const channel18RemoveError: InferClientEventErrors<typeof api.channels.channel18, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-18" },
  };
export const channel18Load: Promise<
  InferOutput<(typeof api.channels.channel18)["procedures"]["load"]>
> = channel18.load({ cursor: 18, channel: 18 });
export const channel18LoadError: InferErrors<
  (typeof api.channels.channel18)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-18" },
};
export const channel18Moderate: Promise<
  InferOutput<(typeof api.channels.channel18)["procedures"]["moderate"]>
> = channel18.moderate({ userId: "user-18", channel: 18 });
export const channel18ModerateError: InferErrors<
  (typeof api.channels.channel18)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-18" },
};
channel18.presence.update({ typing: true, channel: 18 });
export const channel18Presence: InferPresence<typeof api.channels.channel18> | undefined =
  channel18.presence.self;
export const channel18Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel18>
>[] = channel18.presence.others;
export const channel18PresenceOff = channel18.presence.on(() => undefined);
export const channel18Dispose = (): void => {
  channel18.dispose();
};

const channel19Params: InferChannelParams<typeof api.channels.channel19> = { roomId: "room-19" };
const channel19 = client.channels.channel19(channel19Params);
export const channel19Status: ChannelStatus = channel19.status;
export const channel19Created = channel19.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel19, "created"> = event;
  void value;
});
export const channel19Updated = channel19.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel19, "updated"> = event;
  void value;
});
export const channel19Deleted = channel19.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel19, "deleted"> = event;
  void value;
});
export const channel19Typing = channel19.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel19, "typing"> = event;
  void value;
});
export const channel19Send: Promise<void> = channel19.send(
  { text: "message-19", nonce: 19 },
  { ack: true },
);
channel19.edit({ id: "item-19", text: "edited-19", nonce: 19 });
channel19.remove({ id: "item-19", nonce: 19 });
export const channel19SendError: InferClientEventErrors<typeof api.channels.channel19, "send"> = {
  code: "MUTED",
  data: { until: 19 },
};
export const channel19EditError: InferClientEventErrors<typeof api.channels.channel19, "edit"> = {
  code: "CONFLICT",
  data: { version: 19 },
};
export const channel19RemoveError: InferClientEventErrors<typeof api.channels.channel19, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-19" },
  };
export const channel19Load: Promise<
  InferOutput<(typeof api.channels.channel19)["procedures"]["load"]>
> = channel19.load({ cursor: 19, channel: 19 });
export const channel19LoadError: InferErrors<
  (typeof api.channels.channel19)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-19" },
};
export const channel19Moderate: Promise<
  InferOutput<(typeof api.channels.channel19)["procedures"]["moderate"]>
> = channel19.moderate({ userId: "user-19", channel: 19 });
export const channel19ModerateError: InferErrors<
  (typeof api.channels.channel19)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-19" },
};
channel19.presence.update({ typing: true, channel: 19 });
export const channel19Presence: InferPresence<typeof api.channels.channel19> | undefined =
  channel19.presence.self;
export const channel19Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel19>
>[] = channel19.presence.others;
export const channel19PresenceOff = channel19.presence.on(() => undefined);
export const channel19Dispose = (): void => {
  channel19.dispose();
};

const channel20Params: InferChannelParams<typeof api.channels.channel20> = { roomId: "room-20" };
const channel20 = client.channels.channel20(channel20Params);
export const channel20Status: ChannelStatus = channel20.status;
export const channel20Created = channel20.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel20, "created"> = event;
  void value;
});
export const channel20Updated = channel20.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel20, "updated"> = event;
  void value;
});
export const channel20Deleted = channel20.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel20, "deleted"> = event;
  void value;
});
export const channel20Typing = channel20.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel20, "typing"> = event;
  void value;
});
export const channel20Send: Promise<void> = channel20.send(
  { text: "message-20", nonce: 20 },
  { ack: true },
);
channel20.edit({ id: "item-20", text: "edited-20", nonce: 20 });
channel20.remove({ id: "item-20", nonce: 20 });
export const channel20SendError: InferClientEventErrors<typeof api.channels.channel20, "send"> = {
  code: "MUTED",
  data: { until: 20 },
};
export const channel20EditError: InferClientEventErrors<typeof api.channels.channel20, "edit"> = {
  code: "CONFLICT",
  data: { version: 20 },
};
export const channel20RemoveError: InferClientEventErrors<typeof api.channels.channel20, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-20" },
  };
export const channel20Load: Promise<
  InferOutput<(typeof api.channels.channel20)["procedures"]["load"]>
> = channel20.load({ cursor: 20, channel: 20 });
export const channel20LoadError: InferErrors<
  (typeof api.channels.channel20)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-20" },
};
export const channel20Moderate: Promise<
  InferOutput<(typeof api.channels.channel20)["procedures"]["moderate"]>
> = channel20.moderate({ userId: "user-20", channel: 20 });
export const channel20ModerateError: InferErrors<
  (typeof api.channels.channel20)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-20" },
};
channel20.presence.update({ typing: true, channel: 20 });
export const channel20Presence: InferPresence<typeof api.channels.channel20> | undefined =
  channel20.presence.self;
export const channel20Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel20>
>[] = channel20.presence.others;
export const channel20PresenceOff = channel20.presence.on(() => undefined);
export const channel20Dispose = (): void => {
  channel20.dispose();
};

const channel21Params: InferChannelParams<typeof api.channels.channel21> = { roomId: "room-21" };
const channel21 = client.channels.channel21(channel21Params);
export const channel21Status: ChannelStatus = channel21.status;
export const channel21Created = channel21.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel21, "created"> = event;
  void value;
});
export const channel21Updated = channel21.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel21, "updated"> = event;
  void value;
});
export const channel21Deleted = channel21.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel21, "deleted"> = event;
  void value;
});
export const channel21Typing = channel21.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel21, "typing"> = event;
  void value;
});
export const channel21Send: Promise<void> = channel21.send(
  { text: "message-21", nonce: 21 },
  { ack: true },
);
channel21.edit({ id: "item-21", text: "edited-21", nonce: 21 });
channel21.remove({ id: "item-21", nonce: 21 });
export const channel21SendError: InferClientEventErrors<typeof api.channels.channel21, "send"> = {
  code: "MUTED",
  data: { until: 21 },
};
export const channel21EditError: InferClientEventErrors<typeof api.channels.channel21, "edit"> = {
  code: "CONFLICT",
  data: { version: 21 },
};
export const channel21RemoveError: InferClientEventErrors<typeof api.channels.channel21, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-21" },
  };
export const channel21Load: Promise<
  InferOutput<(typeof api.channels.channel21)["procedures"]["load"]>
> = channel21.load({ cursor: 21, channel: 21 });
export const channel21LoadError: InferErrors<
  (typeof api.channels.channel21)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-21" },
};
export const channel21Moderate: Promise<
  InferOutput<(typeof api.channels.channel21)["procedures"]["moderate"]>
> = channel21.moderate({ userId: "user-21", channel: 21 });
export const channel21ModerateError: InferErrors<
  (typeof api.channels.channel21)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-21" },
};
channel21.presence.update({ typing: true, channel: 21 });
export const channel21Presence: InferPresence<typeof api.channels.channel21> | undefined =
  channel21.presence.self;
export const channel21Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel21>
>[] = channel21.presence.others;
export const channel21PresenceOff = channel21.presence.on(() => undefined);
export const channel21Dispose = (): void => {
  channel21.dispose();
};

const channel22Params: InferChannelParams<typeof api.channels.channel22> = { roomId: "room-22" };
const channel22 = client.channels.channel22(channel22Params);
export const channel22Status: ChannelStatus = channel22.status;
export const channel22Created = channel22.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel22, "created"> = event;
  void value;
});
export const channel22Updated = channel22.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel22, "updated"> = event;
  void value;
});
export const channel22Deleted = channel22.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel22, "deleted"> = event;
  void value;
});
export const channel22Typing = channel22.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel22, "typing"> = event;
  void value;
});
export const channel22Send: Promise<void> = channel22.send(
  { text: "message-22", nonce: 22 },
  { ack: true },
);
channel22.edit({ id: "item-22", text: "edited-22", nonce: 22 });
channel22.remove({ id: "item-22", nonce: 22 });
export const channel22SendError: InferClientEventErrors<typeof api.channels.channel22, "send"> = {
  code: "MUTED",
  data: { until: 22 },
};
export const channel22EditError: InferClientEventErrors<typeof api.channels.channel22, "edit"> = {
  code: "CONFLICT",
  data: { version: 22 },
};
export const channel22RemoveError: InferClientEventErrors<typeof api.channels.channel22, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-22" },
  };
export const channel22Load: Promise<
  InferOutput<(typeof api.channels.channel22)["procedures"]["load"]>
> = channel22.load({ cursor: 22, channel: 22 });
export const channel22LoadError: InferErrors<
  (typeof api.channels.channel22)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-22" },
};
export const channel22Moderate: Promise<
  InferOutput<(typeof api.channels.channel22)["procedures"]["moderate"]>
> = channel22.moderate({ userId: "user-22", channel: 22 });
export const channel22ModerateError: InferErrors<
  (typeof api.channels.channel22)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-22" },
};
channel22.presence.update({ typing: true, channel: 22 });
export const channel22Presence: InferPresence<typeof api.channels.channel22> | undefined =
  channel22.presence.self;
export const channel22Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel22>
>[] = channel22.presence.others;
export const channel22PresenceOff = channel22.presence.on(() => undefined);
export const channel22Dispose = (): void => {
  channel22.dispose();
};

const channel23Params: InferChannelParams<typeof api.channels.channel23> = { roomId: "room-23" };
const channel23 = client.channels.channel23(channel23Params);
export const channel23Status: ChannelStatus = channel23.status;
export const channel23Created = channel23.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel23, "created"> = event;
  void value;
});
export const channel23Updated = channel23.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel23, "updated"> = event;
  void value;
});
export const channel23Deleted = channel23.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel23, "deleted"> = event;
  void value;
});
export const channel23Typing = channel23.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel23, "typing"> = event;
  void value;
});
export const channel23Send: Promise<void> = channel23.send(
  { text: "message-23", nonce: 23 },
  { ack: true },
);
channel23.edit({ id: "item-23", text: "edited-23", nonce: 23 });
channel23.remove({ id: "item-23", nonce: 23 });
export const channel23SendError: InferClientEventErrors<typeof api.channels.channel23, "send"> = {
  code: "MUTED",
  data: { until: 23 },
};
export const channel23EditError: InferClientEventErrors<typeof api.channels.channel23, "edit"> = {
  code: "CONFLICT",
  data: { version: 23 },
};
export const channel23RemoveError: InferClientEventErrors<typeof api.channels.channel23, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-23" },
  };
export const channel23Load: Promise<
  InferOutput<(typeof api.channels.channel23)["procedures"]["load"]>
> = channel23.load({ cursor: 23, channel: 23 });
export const channel23LoadError: InferErrors<
  (typeof api.channels.channel23)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-23" },
};
export const channel23Moderate: Promise<
  InferOutput<(typeof api.channels.channel23)["procedures"]["moderate"]>
> = channel23.moderate({ userId: "user-23", channel: 23 });
export const channel23ModerateError: InferErrors<
  (typeof api.channels.channel23)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-23" },
};
channel23.presence.update({ typing: true, channel: 23 });
export const channel23Presence: InferPresence<typeof api.channels.channel23> | undefined =
  channel23.presence.self;
export const channel23Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel23>
>[] = channel23.presence.others;
export const channel23PresenceOff = channel23.presence.on(() => undefined);
export const channel23Dispose = (): void => {
  channel23.dispose();
};

const channel24Params: InferChannelParams<typeof api.channels.channel24> = { roomId: "room-24" };
const channel24 = client.channels.channel24(channel24Params);
export const channel24Status: ChannelStatus = channel24.status;
export const channel24Created = channel24.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel24, "created"> = event;
  void value;
});
export const channel24Updated = channel24.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel24, "updated"> = event;
  void value;
});
export const channel24Deleted = channel24.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel24, "deleted"> = event;
  void value;
});
export const channel24Typing = channel24.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel24, "typing"> = event;
  void value;
});
export const channel24Send: Promise<void> = channel24.send(
  { text: "message-24", nonce: 24 },
  { ack: true },
);
channel24.edit({ id: "item-24", text: "edited-24", nonce: 24 });
channel24.remove({ id: "item-24", nonce: 24 });
export const channel24SendError: InferClientEventErrors<typeof api.channels.channel24, "send"> = {
  code: "MUTED",
  data: { until: 24 },
};
export const channel24EditError: InferClientEventErrors<typeof api.channels.channel24, "edit"> = {
  code: "CONFLICT",
  data: { version: 24 },
};
export const channel24RemoveError: InferClientEventErrors<typeof api.channels.channel24, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-24" },
  };
export const channel24Load: Promise<
  InferOutput<(typeof api.channels.channel24)["procedures"]["load"]>
> = channel24.load({ cursor: 24, channel: 24 });
export const channel24LoadError: InferErrors<
  (typeof api.channels.channel24)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-24" },
};
export const channel24Moderate: Promise<
  InferOutput<(typeof api.channels.channel24)["procedures"]["moderate"]>
> = channel24.moderate({ userId: "user-24", channel: 24 });
export const channel24ModerateError: InferErrors<
  (typeof api.channels.channel24)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-24" },
};
channel24.presence.update({ typing: true, channel: 24 });
export const channel24Presence: InferPresence<typeof api.channels.channel24> | undefined =
  channel24.presence.self;
export const channel24Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel24>
>[] = channel24.presence.others;
export const channel24PresenceOff = channel24.presence.on(() => undefined);
export const channel24Dispose = (): void => {
  channel24.dispose();
};

const channel25Params: InferChannelParams<typeof api.channels.channel25> = { roomId: "room-25" };
const channel25 = client.channels.channel25(channel25Params);
export const channel25Status: ChannelStatus = channel25.status;
export const channel25Created = channel25.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel25, "created"> = event;
  void value;
});
export const channel25Updated = channel25.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel25, "updated"> = event;
  void value;
});
export const channel25Deleted = channel25.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel25, "deleted"> = event;
  void value;
});
export const channel25Typing = channel25.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel25, "typing"> = event;
  void value;
});
export const channel25Send: Promise<void> = channel25.send(
  { text: "message-25", nonce: 25 },
  { ack: true },
);
channel25.edit({ id: "item-25", text: "edited-25", nonce: 25 });
channel25.remove({ id: "item-25", nonce: 25 });
export const channel25SendError: InferClientEventErrors<typeof api.channels.channel25, "send"> = {
  code: "MUTED",
  data: { until: 25 },
};
export const channel25EditError: InferClientEventErrors<typeof api.channels.channel25, "edit"> = {
  code: "CONFLICT",
  data: { version: 25 },
};
export const channel25RemoveError: InferClientEventErrors<typeof api.channels.channel25, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-25" },
  };
export const channel25Load: Promise<
  InferOutput<(typeof api.channels.channel25)["procedures"]["load"]>
> = channel25.load({ cursor: 25, channel: 25 });
export const channel25LoadError: InferErrors<
  (typeof api.channels.channel25)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-25" },
};
export const channel25Moderate: Promise<
  InferOutput<(typeof api.channels.channel25)["procedures"]["moderate"]>
> = channel25.moderate({ userId: "user-25", channel: 25 });
export const channel25ModerateError: InferErrors<
  (typeof api.channels.channel25)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-25" },
};
channel25.presence.update({ typing: true, channel: 25 });
export const channel25Presence: InferPresence<typeof api.channels.channel25> | undefined =
  channel25.presence.self;
export const channel25Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel25>
>[] = channel25.presence.others;
export const channel25PresenceOff = channel25.presence.on(() => undefined);
export const channel25Dispose = (): void => {
  channel25.dispose();
};

const channel26Params: InferChannelParams<typeof api.channels.channel26> = { roomId: "room-26" };
const channel26 = client.channels.channel26(channel26Params);
export const channel26Status: ChannelStatus = channel26.status;
export const channel26Created = channel26.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel26, "created"> = event;
  void value;
});
export const channel26Updated = channel26.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel26, "updated"> = event;
  void value;
});
export const channel26Deleted = channel26.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel26, "deleted"> = event;
  void value;
});
export const channel26Typing = channel26.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel26, "typing"> = event;
  void value;
});
export const channel26Send: Promise<void> = channel26.send(
  { text: "message-26", nonce: 26 },
  { ack: true },
);
channel26.edit({ id: "item-26", text: "edited-26", nonce: 26 });
channel26.remove({ id: "item-26", nonce: 26 });
export const channel26SendError: InferClientEventErrors<typeof api.channels.channel26, "send"> = {
  code: "MUTED",
  data: { until: 26 },
};
export const channel26EditError: InferClientEventErrors<typeof api.channels.channel26, "edit"> = {
  code: "CONFLICT",
  data: { version: 26 },
};
export const channel26RemoveError: InferClientEventErrors<typeof api.channels.channel26, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-26" },
  };
export const channel26Load: Promise<
  InferOutput<(typeof api.channels.channel26)["procedures"]["load"]>
> = channel26.load({ cursor: 26, channel: 26 });
export const channel26LoadError: InferErrors<
  (typeof api.channels.channel26)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-26" },
};
export const channel26Moderate: Promise<
  InferOutput<(typeof api.channels.channel26)["procedures"]["moderate"]>
> = channel26.moderate({ userId: "user-26", channel: 26 });
export const channel26ModerateError: InferErrors<
  (typeof api.channels.channel26)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-26" },
};
channel26.presence.update({ typing: true, channel: 26 });
export const channel26Presence: InferPresence<typeof api.channels.channel26> | undefined =
  channel26.presence.self;
export const channel26Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel26>
>[] = channel26.presence.others;
export const channel26PresenceOff = channel26.presence.on(() => undefined);
export const channel26Dispose = (): void => {
  channel26.dispose();
};

const channel27Params: InferChannelParams<typeof api.channels.channel27> = { roomId: "room-27" };
const channel27 = client.channels.channel27(channel27Params);
export const channel27Status: ChannelStatus = channel27.status;
export const channel27Created = channel27.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel27, "created"> = event;
  void value;
});
export const channel27Updated = channel27.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel27, "updated"> = event;
  void value;
});
export const channel27Deleted = channel27.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel27, "deleted"> = event;
  void value;
});
export const channel27Typing = channel27.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel27, "typing"> = event;
  void value;
});
export const channel27Send: Promise<void> = channel27.send(
  { text: "message-27", nonce: 27 },
  { ack: true },
);
channel27.edit({ id: "item-27", text: "edited-27", nonce: 27 });
channel27.remove({ id: "item-27", nonce: 27 });
export const channel27SendError: InferClientEventErrors<typeof api.channels.channel27, "send"> = {
  code: "MUTED",
  data: { until: 27 },
};
export const channel27EditError: InferClientEventErrors<typeof api.channels.channel27, "edit"> = {
  code: "CONFLICT",
  data: { version: 27 },
};
export const channel27RemoveError: InferClientEventErrors<typeof api.channels.channel27, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-27" },
  };
export const channel27Load: Promise<
  InferOutput<(typeof api.channels.channel27)["procedures"]["load"]>
> = channel27.load({ cursor: 27, channel: 27 });
export const channel27LoadError: InferErrors<
  (typeof api.channels.channel27)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-27" },
};
export const channel27Moderate: Promise<
  InferOutput<(typeof api.channels.channel27)["procedures"]["moderate"]>
> = channel27.moderate({ userId: "user-27", channel: 27 });
export const channel27ModerateError: InferErrors<
  (typeof api.channels.channel27)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-27" },
};
channel27.presence.update({ typing: true, channel: 27 });
export const channel27Presence: InferPresence<typeof api.channels.channel27> | undefined =
  channel27.presence.self;
export const channel27Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel27>
>[] = channel27.presence.others;
export const channel27PresenceOff = channel27.presence.on(() => undefined);
export const channel27Dispose = (): void => {
  channel27.dispose();
};

const channel28Params: InferChannelParams<typeof api.channels.channel28> = { roomId: "room-28" };
const channel28 = client.channels.channel28(channel28Params);
export const channel28Status: ChannelStatus = channel28.status;
export const channel28Created = channel28.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel28, "created"> = event;
  void value;
});
export const channel28Updated = channel28.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel28, "updated"> = event;
  void value;
});
export const channel28Deleted = channel28.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel28, "deleted"> = event;
  void value;
});
export const channel28Typing = channel28.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel28, "typing"> = event;
  void value;
});
export const channel28Send: Promise<void> = channel28.send(
  { text: "message-28", nonce: 28 },
  { ack: true },
);
channel28.edit({ id: "item-28", text: "edited-28", nonce: 28 });
channel28.remove({ id: "item-28", nonce: 28 });
export const channel28SendError: InferClientEventErrors<typeof api.channels.channel28, "send"> = {
  code: "MUTED",
  data: { until: 28 },
};
export const channel28EditError: InferClientEventErrors<typeof api.channels.channel28, "edit"> = {
  code: "CONFLICT",
  data: { version: 28 },
};
export const channel28RemoveError: InferClientEventErrors<typeof api.channels.channel28, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-28" },
  };
export const channel28Load: Promise<
  InferOutput<(typeof api.channels.channel28)["procedures"]["load"]>
> = channel28.load({ cursor: 28, channel: 28 });
export const channel28LoadError: InferErrors<
  (typeof api.channels.channel28)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-28" },
};
export const channel28Moderate: Promise<
  InferOutput<(typeof api.channels.channel28)["procedures"]["moderate"]>
> = channel28.moderate({ userId: "user-28", channel: 28 });
export const channel28ModerateError: InferErrors<
  (typeof api.channels.channel28)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-28" },
};
channel28.presence.update({ typing: true, channel: 28 });
export const channel28Presence: InferPresence<typeof api.channels.channel28> | undefined =
  channel28.presence.self;
export const channel28Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel28>
>[] = channel28.presence.others;
export const channel28PresenceOff = channel28.presence.on(() => undefined);
export const channel28Dispose = (): void => {
  channel28.dispose();
};

const channel29Params: InferChannelParams<typeof api.channels.channel29> = { roomId: "room-29" };
const channel29 = client.channels.channel29(channel29Params);
export const channel29Status: ChannelStatus = channel29.status;
export const channel29Created = channel29.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel29, "created"> = event;
  void value;
});
export const channel29Updated = channel29.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel29, "updated"> = event;
  void value;
});
export const channel29Deleted = channel29.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel29, "deleted"> = event;
  void value;
});
export const channel29Typing = channel29.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel29, "typing"> = event;
  void value;
});
export const channel29Send: Promise<void> = channel29.send(
  { text: "message-29", nonce: 29 },
  { ack: true },
);
channel29.edit({ id: "item-29", text: "edited-29", nonce: 29 });
channel29.remove({ id: "item-29", nonce: 29 });
export const channel29SendError: InferClientEventErrors<typeof api.channels.channel29, "send"> = {
  code: "MUTED",
  data: { until: 29 },
};
export const channel29EditError: InferClientEventErrors<typeof api.channels.channel29, "edit"> = {
  code: "CONFLICT",
  data: { version: 29 },
};
export const channel29RemoveError: InferClientEventErrors<typeof api.channels.channel29, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-29" },
  };
export const channel29Load: Promise<
  InferOutput<(typeof api.channels.channel29)["procedures"]["load"]>
> = channel29.load({ cursor: 29, channel: 29 });
export const channel29LoadError: InferErrors<
  (typeof api.channels.channel29)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-29" },
};
export const channel29Moderate: Promise<
  InferOutput<(typeof api.channels.channel29)["procedures"]["moderate"]>
> = channel29.moderate({ userId: "user-29", channel: 29 });
export const channel29ModerateError: InferErrors<
  (typeof api.channels.channel29)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-29" },
};
channel29.presence.update({ typing: true, channel: 29 });
export const channel29Presence: InferPresence<typeof api.channels.channel29> | undefined =
  channel29.presence.self;
export const channel29Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel29>
>[] = channel29.presence.others;
export const channel29PresenceOff = channel29.presence.on(() => undefined);
export const channel29Dispose = (): void => {
  channel29.dispose();
};

const channel30Params: InferChannelParams<typeof api.channels.channel30> = { roomId: "room-30" };
const channel30 = client.channels.channel30(channel30Params);
export const channel30Status: ChannelStatus = channel30.status;
export const channel30Created = channel30.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel30, "created"> = event;
  void value;
});
export const channel30Updated = channel30.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel30, "updated"> = event;
  void value;
});
export const channel30Deleted = channel30.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel30, "deleted"> = event;
  void value;
});
export const channel30Typing = channel30.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel30, "typing"> = event;
  void value;
});
export const channel30Send: Promise<void> = channel30.send(
  { text: "message-30", nonce: 30 },
  { ack: true },
);
channel30.edit({ id: "item-30", text: "edited-30", nonce: 30 });
channel30.remove({ id: "item-30", nonce: 30 });
export const channel30SendError: InferClientEventErrors<typeof api.channels.channel30, "send"> = {
  code: "MUTED",
  data: { until: 30 },
};
export const channel30EditError: InferClientEventErrors<typeof api.channels.channel30, "edit"> = {
  code: "CONFLICT",
  data: { version: 30 },
};
export const channel30RemoveError: InferClientEventErrors<typeof api.channels.channel30, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-30" },
  };
export const channel30Load: Promise<
  InferOutput<(typeof api.channels.channel30)["procedures"]["load"]>
> = channel30.load({ cursor: 30, channel: 30 });
export const channel30LoadError: InferErrors<
  (typeof api.channels.channel30)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-30" },
};
export const channel30Moderate: Promise<
  InferOutput<(typeof api.channels.channel30)["procedures"]["moderate"]>
> = channel30.moderate({ userId: "user-30", channel: 30 });
export const channel30ModerateError: InferErrors<
  (typeof api.channels.channel30)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-30" },
};
channel30.presence.update({ typing: true, channel: 30 });
export const channel30Presence: InferPresence<typeof api.channels.channel30> | undefined =
  channel30.presence.self;
export const channel30Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel30>
>[] = channel30.presence.others;
export const channel30PresenceOff = channel30.presence.on(() => undefined);
export const channel30Dispose = (): void => {
  channel30.dispose();
};

const channel31Params: InferChannelParams<typeof api.channels.channel31> = { roomId: "room-31" };
const channel31 = client.channels.channel31(channel31Params);
export const channel31Status: ChannelStatus = channel31.status;
export const channel31Created = channel31.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel31, "created"> = event;
  void value;
});
export const channel31Updated = channel31.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel31, "updated"> = event;
  void value;
});
export const channel31Deleted = channel31.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel31, "deleted"> = event;
  void value;
});
export const channel31Typing = channel31.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel31, "typing"> = event;
  void value;
});
export const channel31Send: Promise<void> = channel31.send(
  { text: "message-31", nonce: 31 },
  { ack: true },
);
channel31.edit({ id: "item-31", text: "edited-31", nonce: 31 });
channel31.remove({ id: "item-31", nonce: 31 });
export const channel31SendError: InferClientEventErrors<typeof api.channels.channel31, "send"> = {
  code: "MUTED",
  data: { until: 31 },
};
export const channel31EditError: InferClientEventErrors<typeof api.channels.channel31, "edit"> = {
  code: "CONFLICT",
  data: { version: 31 },
};
export const channel31RemoveError: InferClientEventErrors<typeof api.channels.channel31, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-31" },
  };
export const channel31Load: Promise<
  InferOutput<(typeof api.channels.channel31)["procedures"]["load"]>
> = channel31.load({ cursor: 31, channel: 31 });
export const channel31LoadError: InferErrors<
  (typeof api.channels.channel31)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-31" },
};
export const channel31Moderate: Promise<
  InferOutput<(typeof api.channels.channel31)["procedures"]["moderate"]>
> = channel31.moderate({ userId: "user-31", channel: 31 });
export const channel31ModerateError: InferErrors<
  (typeof api.channels.channel31)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-31" },
};
channel31.presence.update({ typing: true, channel: 31 });
export const channel31Presence: InferPresence<typeof api.channels.channel31> | undefined =
  channel31.presence.self;
export const channel31Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel31>
>[] = channel31.presence.others;
export const channel31PresenceOff = channel31.presence.on(() => undefined);
export const channel31Dispose = (): void => {
  channel31.dispose();
};

const channel32Params: InferChannelParams<typeof api.channels.channel32> = { roomId: "room-32" };
const channel32 = client.channels.channel32(channel32Params);
export const channel32Status: ChannelStatus = channel32.status;
export const channel32Created = channel32.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel32, "created"> = event;
  void value;
});
export const channel32Updated = channel32.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel32, "updated"> = event;
  void value;
});
export const channel32Deleted = channel32.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel32, "deleted"> = event;
  void value;
});
export const channel32Typing = channel32.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel32, "typing"> = event;
  void value;
});
export const channel32Send: Promise<void> = channel32.send(
  { text: "message-32", nonce: 32 },
  { ack: true },
);
channel32.edit({ id: "item-32", text: "edited-32", nonce: 32 });
channel32.remove({ id: "item-32", nonce: 32 });
export const channel32SendError: InferClientEventErrors<typeof api.channels.channel32, "send"> = {
  code: "MUTED",
  data: { until: 32 },
};
export const channel32EditError: InferClientEventErrors<typeof api.channels.channel32, "edit"> = {
  code: "CONFLICT",
  data: { version: 32 },
};
export const channel32RemoveError: InferClientEventErrors<typeof api.channels.channel32, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-32" },
  };
export const channel32Load: Promise<
  InferOutput<(typeof api.channels.channel32)["procedures"]["load"]>
> = channel32.load({ cursor: 32, channel: 32 });
export const channel32LoadError: InferErrors<
  (typeof api.channels.channel32)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-32" },
};
export const channel32Moderate: Promise<
  InferOutput<(typeof api.channels.channel32)["procedures"]["moderate"]>
> = channel32.moderate({ userId: "user-32", channel: 32 });
export const channel32ModerateError: InferErrors<
  (typeof api.channels.channel32)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-32" },
};
channel32.presence.update({ typing: true, channel: 32 });
export const channel32Presence: InferPresence<typeof api.channels.channel32> | undefined =
  channel32.presence.self;
export const channel32Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel32>
>[] = channel32.presence.others;
export const channel32PresenceOff = channel32.presence.on(() => undefined);
export const channel32Dispose = (): void => {
  channel32.dispose();
};

const channel33Params: InferChannelParams<typeof api.channels.channel33> = { roomId: "room-33" };
const channel33 = client.channels.channel33(channel33Params);
export const channel33Status: ChannelStatus = channel33.status;
export const channel33Created = channel33.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel33, "created"> = event;
  void value;
});
export const channel33Updated = channel33.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel33, "updated"> = event;
  void value;
});
export const channel33Deleted = channel33.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel33, "deleted"> = event;
  void value;
});
export const channel33Typing = channel33.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel33, "typing"> = event;
  void value;
});
export const channel33Send: Promise<void> = channel33.send(
  { text: "message-33", nonce: 33 },
  { ack: true },
);
channel33.edit({ id: "item-33", text: "edited-33", nonce: 33 });
channel33.remove({ id: "item-33", nonce: 33 });
export const channel33SendError: InferClientEventErrors<typeof api.channels.channel33, "send"> = {
  code: "MUTED",
  data: { until: 33 },
};
export const channel33EditError: InferClientEventErrors<typeof api.channels.channel33, "edit"> = {
  code: "CONFLICT",
  data: { version: 33 },
};
export const channel33RemoveError: InferClientEventErrors<typeof api.channels.channel33, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-33" },
  };
export const channel33Load: Promise<
  InferOutput<(typeof api.channels.channel33)["procedures"]["load"]>
> = channel33.load({ cursor: 33, channel: 33 });
export const channel33LoadError: InferErrors<
  (typeof api.channels.channel33)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-33" },
};
export const channel33Moderate: Promise<
  InferOutput<(typeof api.channels.channel33)["procedures"]["moderate"]>
> = channel33.moderate({ userId: "user-33", channel: 33 });
export const channel33ModerateError: InferErrors<
  (typeof api.channels.channel33)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-33" },
};
channel33.presence.update({ typing: true, channel: 33 });
export const channel33Presence: InferPresence<typeof api.channels.channel33> | undefined =
  channel33.presence.self;
export const channel33Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel33>
>[] = channel33.presence.others;
export const channel33PresenceOff = channel33.presence.on(() => undefined);
export const channel33Dispose = (): void => {
  channel33.dispose();
};

const channel34Params: InferChannelParams<typeof api.channels.channel34> = { roomId: "room-34" };
const channel34 = client.channels.channel34(channel34Params);
export const channel34Status: ChannelStatus = channel34.status;
export const channel34Created = channel34.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel34, "created"> = event;
  void value;
});
export const channel34Updated = channel34.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel34, "updated"> = event;
  void value;
});
export const channel34Deleted = channel34.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel34, "deleted"> = event;
  void value;
});
export const channel34Typing = channel34.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel34, "typing"> = event;
  void value;
});
export const channel34Send: Promise<void> = channel34.send(
  { text: "message-34", nonce: 34 },
  { ack: true },
);
channel34.edit({ id: "item-34", text: "edited-34", nonce: 34 });
channel34.remove({ id: "item-34", nonce: 34 });
export const channel34SendError: InferClientEventErrors<typeof api.channels.channel34, "send"> = {
  code: "MUTED",
  data: { until: 34 },
};
export const channel34EditError: InferClientEventErrors<typeof api.channels.channel34, "edit"> = {
  code: "CONFLICT",
  data: { version: 34 },
};
export const channel34RemoveError: InferClientEventErrors<typeof api.channels.channel34, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-34" },
  };
export const channel34Load: Promise<
  InferOutput<(typeof api.channels.channel34)["procedures"]["load"]>
> = channel34.load({ cursor: 34, channel: 34 });
export const channel34LoadError: InferErrors<
  (typeof api.channels.channel34)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-34" },
};
export const channel34Moderate: Promise<
  InferOutput<(typeof api.channels.channel34)["procedures"]["moderate"]>
> = channel34.moderate({ userId: "user-34", channel: 34 });
export const channel34ModerateError: InferErrors<
  (typeof api.channels.channel34)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-34" },
};
channel34.presence.update({ typing: true, channel: 34 });
export const channel34Presence: InferPresence<typeof api.channels.channel34> | undefined =
  channel34.presence.self;
export const channel34Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel34>
>[] = channel34.presence.others;
export const channel34PresenceOff = channel34.presence.on(() => undefined);
export const channel34Dispose = (): void => {
  channel34.dispose();
};

const channel35Params: InferChannelParams<typeof api.channels.channel35> = { roomId: "room-35" };
const channel35 = client.channels.channel35(channel35Params);
export const channel35Status: ChannelStatus = channel35.status;
export const channel35Created = channel35.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel35, "created"> = event;
  void value;
});
export const channel35Updated = channel35.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel35, "updated"> = event;
  void value;
});
export const channel35Deleted = channel35.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel35, "deleted"> = event;
  void value;
});
export const channel35Typing = channel35.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel35, "typing"> = event;
  void value;
});
export const channel35Send: Promise<void> = channel35.send(
  { text: "message-35", nonce: 35 },
  { ack: true },
);
channel35.edit({ id: "item-35", text: "edited-35", nonce: 35 });
channel35.remove({ id: "item-35", nonce: 35 });
export const channel35SendError: InferClientEventErrors<typeof api.channels.channel35, "send"> = {
  code: "MUTED",
  data: { until: 35 },
};
export const channel35EditError: InferClientEventErrors<typeof api.channels.channel35, "edit"> = {
  code: "CONFLICT",
  data: { version: 35 },
};
export const channel35RemoveError: InferClientEventErrors<typeof api.channels.channel35, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-35" },
  };
export const channel35Load: Promise<
  InferOutput<(typeof api.channels.channel35)["procedures"]["load"]>
> = channel35.load({ cursor: 35, channel: 35 });
export const channel35LoadError: InferErrors<
  (typeof api.channels.channel35)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-35" },
};
export const channel35Moderate: Promise<
  InferOutput<(typeof api.channels.channel35)["procedures"]["moderate"]>
> = channel35.moderate({ userId: "user-35", channel: 35 });
export const channel35ModerateError: InferErrors<
  (typeof api.channels.channel35)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-35" },
};
channel35.presence.update({ typing: true, channel: 35 });
export const channel35Presence: InferPresence<typeof api.channels.channel35> | undefined =
  channel35.presence.self;
export const channel35Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel35>
>[] = channel35.presence.others;
export const channel35PresenceOff = channel35.presence.on(() => undefined);
export const channel35Dispose = (): void => {
  channel35.dispose();
};

const channel36Params: InferChannelParams<typeof api.channels.channel36> = { roomId: "room-36" };
const channel36 = client.channels.channel36(channel36Params);
export const channel36Status: ChannelStatus = channel36.status;
export const channel36Created = channel36.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel36, "created"> = event;
  void value;
});
export const channel36Updated = channel36.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel36, "updated"> = event;
  void value;
});
export const channel36Deleted = channel36.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel36, "deleted"> = event;
  void value;
});
export const channel36Typing = channel36.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel36, "typing"> = event;
  void value;
});
export const channel36Send: Promise<void> = channel36.send(
  { text: "message-36", nonce: 36 },
  { ack: true },
);
channel36.edit({ id: "item-36", text: "edited-36", nonce: 36 });
channel36.remove({ id: "item-36", nonce: 36 });
export const channel36SendError: InferClientEventErrors<typeof api.channels.channel36, "send"> = {
  code: "MUTED",
  data: { until: 36 },
};
export const channel36EditError: InferClientEventErrors<typeof api.channels.channel36, "edit"> = {
  code: "CONFLICT",
  data: { version: 36 },
};
export const channel36RemoveError: InferClientEventErrors<typeof api.channels.channel36, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-36" },
  };
export const channel36Load: Promise<
  InferOutput<(typeof api.channels.channel36)["procedures"]["load"]>
> = channel36.load({ cursor: 36, channel: 36 });
export const channel36LoadError: InferErrors<
  (typeof api.channels.channel36)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-36" },
};
export const channel36Moderate: Promise<
  InferOutput<(typeof api.channels.channel36)["procedures"]["moderate"]>
> = channel36.moderate({ userId: "user-36", channel: 36 });
export const channel36ModerateError: InferErrors<
  (typeof api.channels.channel36)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-36" },
};
channel36.presence.update({ typing: true, channel: 36 });
export const channel36Presence: InferPresence<typeof api.channels.channel36> | undefined =
  channel36.presence.self;
export const channel36Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel36>
>[] = channel36.presence.others;
export const channel36PresenceOff = channel36.presence.on(() => undefined);
export const channel36Dispose = (): void => {
  channel36.dispose();
};

const channel37Params: InferChannelParams<typeof api.channels.channel37> = { roomId: "room-37" };
const channel37 = client.channels.channel37(channel37Params);
export const channel37Status: ChannelStatus = channel37.status;
export const channel37Created = channel37.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel37, "created"> = event;
  void value;
});
export const channel37Updated = channel37.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel37, "updated"> = event;
  void value;
});
export const channel37Deleted = channel37.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel37, "deleted"> = event;
  void value;
});
export const channel37Typing = channel37.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel37, "typing"> = event;
  void value;
});
export const channel37Send: Promise<void> = channel37.send(
  { text: "message-37", nonce: 37 },
  { ack: true },
);
channel37.edit({ id: "item-37", text: "edited-37", nonce: 37 });
channel37.remove({ id: "item-37", nonce: 37 });
export const channel37SendError: InferClientEventErrors<typeof api.channels.channel37, "send"> = {
  code: "MUTED",
  data: { until: 37 },
};
export const channel37EditError: InferClientEventErrors<typeof api.channels.channel37, "edit"> = {
  code: "CONFLICT",
  data: { version: 37 },
};
export const channel37RemoveError: InferClientEventErrors<typeof api.channels.channel37, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-37" },
  };
export const channel37Load: Promise<
  InferOutput<(typeof api.channels.channel37)["procedures"]["load"]>
> = channel37.load({ cursor: 37, channel: 37 });
export const channel37LoadError: InferErrors<
  (typeof api.channels.channel37)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-37" },
};
export const channel37Moderate: Promise<
  InferOutput<(typeof api.channels.channel37)["procedures"]["moderate"]>
> = channel37.moderate({ userId: "user-37", channel: 37 });
export const channel37ModerateError: InferErrors<
  (typeof api.channels.channel37)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-37" },
};
channel37.presence.update({ typing: true, channel: 37 });
export const channel37Presence: InferPresence<typeof api.channels.channel37> | undefined =
  channel37.presence.self;
export const channel37Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel37>
>[] = channel37.presence.others;
export const channel37PresenceOff = channel37.presence.on(() => undefined);
export const channel37Dispose = (): void => {
  channel37.dispose();
};

const channel38Params: InferChannelParams<typeof api.channels.channel38> = { roomId: "room-38" };
const channel38 = client.channels.channel38(channel38Params);
export const channel38Status: ChannelStatus = channel38.status;
export const channel38Created = channel38.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel38, "created"> = event;
  void value;
});
export const channel38Updated = channel38.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel38, "updated"> = event;
  void value;
});
export const channel38Deleted = channel38.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel38, "deleted"> = event;
  void value;
});
export const channel38Typing = channel38.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel38, "typing"> = event;
  void value;
});
export const channel38Send: Promise<void> = channel38.send(
  { text: "message-38", nonce: 38 },
  { ack: true },
);
channel38.edit({ id: "item-38", text: "edited-38", nonce: 38 });
channel38.remove({ id: "item-38", nonce: 38 });
export const channel38SendError: InferClientEventErrors<typeof api.channels.channel38, "send"> = {
  code: "MUTED",
  data: { until: 38 },
};
export const channel38EditError: InferClientEventErrors<typeof api.channels.channel38, "edit"> = {
  code: "CONFLICT",
  data: { version: 38 },
};
export const channel38RemoveError: InferClientEventErrors<typeof api.channels.channel38, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-38" },
  };
export const channel38Load: Promise<
  InferOutput<(typeof api.channels.channel38)["procedures"]["load"]>
> = channel38.load({ cursor: 38, channel: 38 });
export const channel38LoadError: InferErrors<
  (typeof api.channels.channel38)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-38" },
};
export const channel38Moderate: Promise<
  InferOutput<(typeof api.channels.channel38)["procedures"]["moderate"]>
> = channel38.moderate({ userId: "user-38", channel: 38 });
export const channel38ModerateError: InferErrors<
  (typeof api.channels.channel38)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-38" },
};
channel38.presence.update({ typing: true, channel: 38 });
export const channel38Presence: InferPresence<typeof api.channels.channel38> | undefined =
  channel38.presence.self;
export const channel38Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel38>
>[] = channel38.presence.others;
export const channel38PresenceOff = channel38.presence.on(() => undefined);
export const channel38Dispose = (): void => {
  channel38.dispose();
};

const channel39Params: InferChannelParams<typeof api.channels.channel39> = { roomId: "room-39" };
const channel39 = client.channels.channel39(channel39Params);
export const channel39Status: ChannelStatus = channel39.status;
export const channel39Created = channel39.on("created", (event) => {
  const value: InferServerEvent<typeof api.channels.channel39, "created"> = event;
  void value;
});
export const channel39Updated = channel39.on("updated", (event) => {
  const value: InferServerEvent<typeof api.channels.channel39, "updated"> = event;
  void value;
});
export const channel39Deleted = channel39.on("deleted", (event) => {
  const value: InferServerEvent<typeof api.channels.channel39, "deleted"> = event;
  void value;
});
export const channel39Typing = channel39.on("typing", (event) => {
  const value: InferServerEvent<typeof api.channels.channel39, "typing"> = event;
  void value;
});
export const channel39Send: Promise<void> = channel39.send(
  { text: "message-39", nonce: 39 },
  { ack: true },
);
channel39.edit({ id: "item-39", text: "edited-39", nonce: 39 });
channel39.remove({ id: "item-39", nonce: 39 });
export const channel39SendError: InferClientEventErrors<typeof api.channels.channel39, "send"> = {
  code: "MUTED",
  data: { until: 39 },
};
export const channel39EditError: InferClientEventErrors<typeof api.channels.channel39, "edit"> = {
  code: "CONFLICT",
  data: { version: 39 },
};
export const channel39RemoveError: InferClientEventErrors<typeof api.channels.channel39, "remove"> =
  {
    code: "FORBIDDEN",
    data: { reason: "channel-39" },
  };
export const channel39Load: Promise<
  InferOutput<(typeof api.channels.channel39)["procedures"]["load"]>
> = channel39.load({ cursor: 39, channel: 39 });
export const channel39LoadError: InferErrors<
  (typeof api.channels.channel39)["procedures"]["load"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-39" },
};
export const channel39Moderate: Promise<
  InferOutput<(typeof api.channels.channel39)["procedures"]["moderate"]>
> = channel39.moderate({ userId: "user-39", channel: 39 });
export const channel39ModerateError: InferErrors<
  (typeof api.channels.channel39)["procedures"]["moderate"]
> = {
  code: "FORBIDDEN",
  data: { reason: "channel-39" },
};
channel39.presence.update({ typing: true, channel: 39 });
export const channel39Presence: InferPresence<typeof api.channels.channel39> | undefined =
  channel39.presence.self;
export const channel39Others: readonly PresenceMember<
  InferPresence<typeof api.channels.channel39>
>[] = channel39.presence.others;
export const channel39PresenceOff = channel39.presence.on(() => undefined);
export const channel39Dispose = (): void => {
  channel39.dispose();
};

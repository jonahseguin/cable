import { createClient } from "@cable/client";
import type { Link } from "@cable/client";
import type {
  InferChannelParams,
  InferClientEventErrors,
  InferClientEventInput,
  InferErrors,
  InferInput,
  InferOutput,
  InferPresence,
  InferServerEvent,
} from "@cable/contract";

import type { Api, api } from "./contract.js";

const memoryLink: Link = () => async (call) => ({ id: call.id, ok: true, data: undefined });
const client = createClient<Api>({ links: [memoryLink] });

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

export interface Channel0Inference {
  readonly params: InferChannelParams<typeof api.channels.channel0>;
  readonly created: InferServerEvent<typeof api.channels.channel0, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel0, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel0, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel0, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel0, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel0, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel0, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel0, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel0, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel0, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel0)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel0)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel0)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel0)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel0)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel0)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel0>;
}

export interface Channel1Inference {
  readonly params: InferChannelParams<typeof api.channels.channel1>;
  readonly created: InferServerEvent<typeof api.channels.channel1, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel1, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel1, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel1, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel1, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel1, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel1, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel1, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel1, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel1, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel1)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel1)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel1)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel1)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel1)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel1)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel1>;
}

export interface Channel2Inference {
  readonly params: InferChannelParams<typeof api.channels.channel2>;
  readonly created: InferServerEvent<typeof api.channels.channel2, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel2, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel2, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel2, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel2, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel2, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel2, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel2, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel2, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel2, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel2)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel2)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel2)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel2)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel2)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel2)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel2>;
}

export interface Channel3Inference {
  readonly params: InferChannelParams<typeof api.channels.channel3>;
  readonly created: InferServerEvent<typeof api.channels.channel3, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel3, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel3, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel3, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel3, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel3, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel3, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel3, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel3, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel3, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel3)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel3)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel3)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel3)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel3)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel3)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel3>;
}

export interface Channel4Inference {
  readonly params: InferChannelParams<typeof api.channels.channel4>;
  readonly created: InferServerEvent<typeof api.channels.channel4, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel4, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel4, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel4, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel4, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel4, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel4, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel4, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel4, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel4, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel4)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel4)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel4)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel4)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel4)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel4)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel4>;
}

export interface Channel5Inference {
  readonly params: InferChannelParams<typeof api.channels.channel5>;
  readonly created: InferServerEvent<typeof api.channels.channel5, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel5, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel5, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel5, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel5, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel5, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel5, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel5, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel5, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel5, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel5)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel5)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel5)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel5)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel5)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel5)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel5>;
}

export interface Channel6Inference {
  readonly params: InferChannelParams<typeof api.channels.channel6>;
  readonly created: InferServerEvent<typeof api.channels.channel6, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel6, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel6, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel6, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel6, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel6, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel6, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel6, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel6, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel6, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel6)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel6)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel6)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel6)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel6)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel6)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel6>;
}

export interface Channel7Inference {
  readonly params: InferChannelParams<typeof api.channels.channel7>;
  readonly created: InferServerEvent<typeof api.channels.channel7, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel7, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel7, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel7, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel7, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel7, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel7, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel7, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel7, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel7, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel7)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel7)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel7)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel7)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel7)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel7)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel7>;
}

export interface Channel8Inference {
  readonly params: InferChannelParams<typeof api.channels.channel8>;
  readonly created: InferServerEvent<typeof api.channels.channel8, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel8, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel8, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel8, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel8, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel8, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel8, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel8, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel8, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel8, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel8)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel8)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel8)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel8)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel8)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel8)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel8>;
}

export interface Channel9Inference {
  readonly params: InferChannelParams<typeof api.channels.channel9>;
  readonly created: InferServerEvent<typeof api.channels.channel9, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel9, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel9, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel9, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel9, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel9, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel9, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel9, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel9, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel9, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel9)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel9)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel9)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel9)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel9)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel9)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel9>;
}

export interface Channel10Inference {
  readonly params: InferChannelParams<typeof api.channels.channel10>;
  readonly created: InferServerEvent<typeof api.channels.channel10, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel10, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel10, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel10, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel10, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel10, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel10, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel10, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel10, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel10, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel10)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel10)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel10)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel10)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel10)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel10)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel10>;
}

export interface Channel11Inference {
  readonly params: InferChannelParams<typeof api.channels.channel11>;
  readonly created: InferServerEvent<typeof api.channels.channel11, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel11, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel11, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel11, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel11, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel11, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel11, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel11, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel11, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel11, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel11)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel11)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel11)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel11)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel11)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel11)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel11>;
}

export interface Channel12Inference {
  readonly params: InferChannelParams<typeof api.channels.channel12>;
  readonly created: InferServerEvent<typeof api.channels.channel12, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel12, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel12, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel12, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel12, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel12, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel12, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel12, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel12, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel12, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel12)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel12)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel12)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel12)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel12)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel12)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel12>;
}

export interface Channel13Inference {
  readonly params: InferChannelParams<typeof api.channels.channel13>;
  readonly created: InferServerEvent<typeof api.channels.channel13, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel13, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel13, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel13, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel13, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel13, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel13, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel13, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel13, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel13, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel13)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel13)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel13)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel13)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel13)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel13)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel13>;
}

export interface Channel14Inference {
  readonly params: InferChannelParams<typeof api.channels.channel14>;
  readonly created: InferServerEvent<typeof api.channels.channel14, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel14, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel14, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel14, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel14, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel14, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel14, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel14, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel14, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel14, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel14)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel14)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel14)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel14)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel14)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel14)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel14>;
}

export interface Channel15Inference {
  readonly params: InferChannelParams<typeof api.channels.channel15>;
  readonly created: InferServerEvent<typeof api.channels.channel15, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel15, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel15, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel15, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel15, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel15, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel15, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel15, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel15, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel15, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel15)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel15)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel15)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel15)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel15)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel15)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel15>;
}

export interface Channel16Inference {
  readonly params: InferChannelParams<typeof api.channels.channel16>;
  readonly created: InferServerEvent<typeof api.channels.channel16, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel16, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel16, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel16, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel16, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel16, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel16, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel16, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel16, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel16, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel16)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel16)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel16)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel16)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel16)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel16)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel16>;
}

export interface Channel17Inference {
  readonly params: InferChannelParams<typeof api.channels.channel17>;
  readonly created: InferServerEvent<typeof api.channels.channel17, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel17, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel17, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel17, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel17, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel17, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel17, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel17, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel17, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel17, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel17)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel17)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel17)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel17)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel17)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel17)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel17>;
}

export interface Channel18Inference {
  readonly params: InferChannelParams<typeof api.channels.channel18>;
  readonly created: InferServerEvent<typeof api.channels.channel18, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel18, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel18, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel18, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel18, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel18, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel18, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel18, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel18, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel18, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel18)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel18)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel18)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel18)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel18)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel18)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel18>;
}

export interface Channel19Inference {
  readonly params: InferChannelParams<typeof api.channels.channel19>;
  readonly created: InferServerEvent<typeof api.channels.channel19, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel19, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel19, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel19, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel19, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel19, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel19, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel19, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel19, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel19, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel19)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel19)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel19)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel19)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel19)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel19)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel19>;
}

export interface Channel20Inference {
  readonly params: InferChannelParams<typeof api.channels.channel20>;
  readonly created: InferServerEvent<typeof api.channels.channel20, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel20, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel20, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel20, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel20, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel20, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel20, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel20, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel20, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel20, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel20)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel20)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel20)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel20)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel20)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel20)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel20>;
}

export interface Channel21Inference {
  readonly params: InferChannelParams<typeof api.channels.channel21>;
  readonly created: InferServerEvent<typeof api.channels.channel21, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel21, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel21, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel21, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel21, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel21, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel21, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel21, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel21, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel21, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel21)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel21)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel21)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel21)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel21)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel21)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel21>;
}

export interface Channel22Inference {
  readonly params: InferChannelParams<typeof api.channels.channel22>;
  readonly created: InferServerEvent<typeof api.channels.channel22, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel22, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel22, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel22, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel22, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel22, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel22, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel22, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel22, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel22, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel22)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel22)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel22)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel22)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel22)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel22)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel22>;
}

export interface Channel23Inference {
  readonly params: InferChannelParams<typeof api.channels.channel23>;
  readonly created: InferServerEvent<typeof api.channels.channel23, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel23, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel23, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel23, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel23, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel23, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel23, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel23, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel23, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel23, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel23)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel23)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel23)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel23)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel23)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel23)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel23>;
}

export interface Channel24Inference {
  readonly params: InferChannelParams<typeof api.channels.channel24>;
  readonly created: InferServerEvent<typeof api.channels.channel24, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel24, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel24, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel24, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel24, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel24, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel24, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel24, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel24, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel24, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel24)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel24)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel24)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel24)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel24)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel24)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel24>;
}

export interface Channel25Inference {
  readonly params: InferChannelParams<typeof api.channels.channel25>;
  readonly created: InferServerEvent<typeof api.channels.channel25, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel25, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel25, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel25, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel25, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel25, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel25, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel25, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel25, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel25, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel25)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel25)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel25)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel25)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel25)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel25)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel25>;
}

export interface Channel26Inference {
  readonly params: InferChannelParams<typeof api.channels.channel26>;
  readonly created: InferServerEvent<typeof api.channels.channel26, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel26, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel26, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel26, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel26, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel26, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel26, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel26, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel26, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel26, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel26)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel26)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel26)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel26)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel26)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel26)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel26>;
}

export interface Channel27Inference {
  readonly params: InferChannelParams<typeof api.channels.channel27>;
  readonly created: InferServerEvent<typeof api.channels.channel27, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel27, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel27, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel27, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel27, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel27, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel27, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel27, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel27, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel27, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel27)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel27)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel27)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel27)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel27)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel27)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel27>;
}

export interface Channel28Inference {
  readonly params: InferChannelParams<typeof api.channels.channel28>;
  readonly created: InferServerEvent<typeof api.channels.channel28, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel28, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel28, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel28, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel28, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel28, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel28, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel28, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel28, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel28, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel28)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel28)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel28)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel28)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel28)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel28)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel28>;
}

export interface Channel29Inference {
  readonly params: InferChannelParams<typeof api.channels.channel29>;
  readonly created: InferServerEvent<typeof api.channels.channel29, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel29, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel29, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel29, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel29, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel29, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel29, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel29, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel29, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel29, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel29)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel29)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel29)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel29)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel29)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel29)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel29>;
}

export interface Channel30Inference {
  readonly params: InferChannelParams<typeof api.channels.channel30>;
  readonly created: InferServerEvent<typeof api.channels.channel30, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel30, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel30, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel30, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel30, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel30, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel30, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel30, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel30, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel30, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel30)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel30)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel30)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel30)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel30)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel30)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel30>;
}

export interface Channel31Inference {
  readonly params: InferChannelParams<typeof api.channels.channel31>;
  readonly created: InferServerEvent<typeof api.channels.channel31, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel31, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel31, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel31, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel31, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel31, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel31, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel31, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel31, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel31, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel31)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel31)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel31)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel31)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel31)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel31)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel31>;
}

export interface Channel32Inference {
  readonly params: InferChannelParams<typeof api.channels.channel32>;
  readonly created: InferServerEvent<typeof api.channels.channel32, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel32, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel32, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel32, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel32, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel32, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel32, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel32, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel32, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel32, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel32)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel32)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel32)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel32)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel32)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel32)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel32>;
}

export interface Channel33Inference {
  readonly params: InferChannelParams<typeof api.channels.channel33>;
  readonly created: InferServerEvent<typeof api.channels.channel33, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel33, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel33, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel33, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel33, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel33, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel33, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel33, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel33, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel33, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel33)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel33)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel33)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel33)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel33)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel33)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel33>;
}

export interface Channel34Inference {
  readonly params: InferChannelParams<typeof api.channels.channel34>;
  readonly created: InferServerEvent<typeof api.channels.channel34, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel34, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel34, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel34, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel34, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel34, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel34, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel34, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel34, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel34, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel34)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel34)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel34)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel34)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel34)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel34)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel34>;
}

export interface Channel35Inference {
  readonly params: InferChannelParams<typeof api.channels.channel35>;
  readonly created: InferServerEvent<typeof api.channels.channel35, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel35, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel35, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel35, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel35, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel35, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel35, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel35, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel35, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel35, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel35)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel35)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel35)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel35)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel35)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel35)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel35>;
}

export interface Channel36Inference {
  readonly params: InferChannelParams<typeof api.channels.channel36>;
  readonly created: InferServerEvent<typeof api.channels.channel36, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel36, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel36, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel36, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel36, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel36, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel36, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel36, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel36, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel36, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel36)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel36)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel36)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel36)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel36)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel36)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel36>;
}

export interface Channel37Inference {
  readonly params: InferChannelParams<typeof api.channels.channel37>;
  readonly created: InferServerEvent<typeof api.channels.channel37, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel37, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel37, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel37, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel37, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel37, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel37, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel37, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel37, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel37, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel37)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel37)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel37)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel37)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel37)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel37)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel37>;
}

export interface Channel38Inference {
  readonly params: InferChannelParams<typeof api.channels.channel38>;
  readonly created: InferServerEvent<typeof api.channels.channel38, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel38, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel38, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel38, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel38, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel38, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel38, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel38, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel38, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel38, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel38)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel38)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel38)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel38)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel38)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel38)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel38>;
}

export interface Channel39Inference {
  readonly params: InferChannelParams<typeof api.channels.channel39>;
  readonly created: InferServerEvent<typeof api.channels.channel39, "created">;
  readonly updated: InferServerEvent<typeof api.channels.channel39, "updated">;
  readonly deleted: InferServerEvent<typeof api.channels.channel39, "deleted">;
  readonly typing: InferServerEvent<typeof api.channels.channel39, "typing">;
  readonly sendInput: InferClientEventInput<typeof api.channels.channel39, "send">;
  readonly sendError: InferClientEventErrors<typeof api.channels.channel39, "send">;
  readonly editInput: InferClientEventInput<typeof api.channels.channel39, "edit">;
  readonly editError: InferClientEventErrors<typeof api.channels.channel39, "edit">;
  readonly removeInput: InferClientEventInput<typeof api.channels.channel39, "remove">;
  readonly removeError: InferClientEventErrors<typeof api.channels.channel39, "remove">;
  readonly loadInput: InferInput<(typeof api.channels.channel39)["procedures"]["load"]>;
  readonly loadOutput: InferOutput<(typeof api.channels.channel39)["procedures"]["load"]>;
  readonly loadError: InferErrors<(typeof api.channels.channel39)["procedures"]["load"]>;
  readonly moderateInput: InferInput<(typeof api.channels.channel39)["procedures"]["moderate"]>;
  readonly moderateOutput: InferOutput<(typeof api.channels.channel39)["procedures"]["moderate"]>;
  readonly moderateError: InferErrors<(typeof api.channels.channel39)["procedures"]["moderate"]>;
  readonly presence: InferPresence<typeof api.channels.channel39>;
}

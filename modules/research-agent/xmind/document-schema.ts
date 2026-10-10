import {z} from 'zod';
export const materialKinds=['text','pdf','docx','xlsx','csv','image'] as const;
export type MaterialKind=typeof materialKinds[number];
const canonicalLocator=z.strictObject({
 paragraph:z.number().int().positive().optional(),physical_page:z.number().int().positive().optional(),
 table:z.number().int().positive().optional(),row:z.number().int().positive().optional(),column:z.number().int().positive().optional(),
 sheet:z.string().min(1).max(100).optional(),cell:z.string().min(1).max(100).optional(),
 bbox:z.union([z.tuple([z.number(),z.number(),z.number(),z.number()]),z.tuple([z.number(),z.number(),z.number(),z.number(),z.number(),z.number(),z.number(),z.number()])]).optional(),
 ocr_confidence:z.number().min(0).max(1).optional(),ocr_engine:z.string().max(100).optional()
});
// The local OCR parser's confidence/engine fields are explicitly mapped to the
// sidecar's OCR-prefixed fields. Existing saved parser receipts remain readable.
export const locatorSchema=z.preprocess(value=>{
 if(!value||typeof value!=='object'||Array.isArray(value))return value;
 const source={...value} as Record<string,unknown>;
 for(const [internal,publicName] of [['confidence','ocr_confidence'],['engine','ocr_engine']]){
  if(internal in source){if(publicName in source&&source[publicName]!==source[internal])return value;source[publicName]=source[internal];delete source[internal];}
 }
 return source;
},canonicalLocator);

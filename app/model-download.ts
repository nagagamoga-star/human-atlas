/** Static hosts may serve .gz as a compressed response or as a gzip file.
 * Fetch already decodes Content-Encoding; inspect the payload to avoid decoding twice.
 */
export const modelDecompressionError='This browser cannot decompress the anatomy models (DecompressionStream is missing). Please use a current version of Chrome, Edge, Firefox, or Safari.';

export async function decodeModelResponse(response:Response,expectedBytes:number):Promise<ArrayBuffer>{
 if(!response.ok)throw new Error('An anatomy file could not be loaded.');
 const payload=await response.arrayBuffer(),signature=new Uint8Array(payload,0,Math.min(2,payload.byteLength));
 const gzip=signature[0]===0x1f&&signature[1]===0x8b;
 if(gzip&&typeof DecompressionStream==='undefined')throw new Error(modelDecompressionError);
 const buffer=gzip?await new Response(new Blob([payload]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer():payload;
 if(buffer.byteLength!==expectedBytes)throw new Error('An anatomy file was incomplete. Please reload the viewer.');
 return buffer;
}

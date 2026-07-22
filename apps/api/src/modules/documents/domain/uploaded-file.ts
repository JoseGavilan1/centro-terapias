/**
 * Forma mínima de un archivo entregado por `FileInterceptor` (multer) que este módulo
 * necesita. Se define localmente en vez de depender de `Express.Multer.File` (`@types/multer`
 * no está instalado — `multer` no trae sus propios tipos — y el resto del contrato no
 * requiere ningún otro campo).
 */
export interface UploadedMulterFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}

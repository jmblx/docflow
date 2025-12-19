import { Router } from 'express';
import { 
  uploadDocument, 
  getDocuments, 
  getDocumentById, 
  updateDocument, 
  deleteDocument,
  signDocument,
  downloadDocument,
  getDocumentStats,
  downloadSignedDocuments,
} from '../controllers/document.controller';
import { authenticate, authorize } from '../middleware/auth.middleware';
import { upload } from '../middleware/upload.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// Все роуты требуют аутентификации
router.use(authenticate);

// Получить все документы
router.get('/', getDocuments);

router.get('/download/signed', downloadSignedDocuments);

router.get('/stats', getDocumentStats);

// Получить документ по ID
router.get('/:id', getDocumentById);

// Скачать документ
router.get('/:id/download', authenticate, downloadDocument);

// Загрузить документ (только админ)
router.post(
  '/upload',
  authorize('admin'),
  upload.single('file'),
  validate([
    { field: 'title', required: true },
  ]),
  uploadDocument
);

// Обновить документ
router.put(
  '/:id',
  validate([
    { field: 'title' },
    { field: 'status', type: 'string' },
  ]),
  updateDocument
);

// Удалить документ (только админ или создатель)
router.delete('/:id', deleteDocument);

// Подписать документ
router.post('/:id/sign', signDocument);

export default router;
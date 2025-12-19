import multer from 'multer';
import path from 'path';
import fs from 'fs';

// Создаем папку uploads если её нет
const uploadDir = 'uploads';
if (!fs.existsSync(uploadDir)) {
  fs.mkdirSync(uploadDir, { recursive: true });
}

// Функция для декодирования имени файла
const decodeFileName = (filename: string): string => {
  try {
    // Пытаемся декодировать из UTF-8 если это нужно
    if (filename.includes('%')) {
      return decodeURIComponent(filename);
    }
    
    // Пробуем разные кодировки для кириллицы
    const encodings: BufferEncoding[] = ['utf8', 'latin1', 'binary'];
    
    for (const encoding of encodings) {
      try {
        const buffer = Buffer.from(filename, 'binary');
        const decoded = buffer.toString(encoding);
        
        // Проверяем, содержит ли результат русские буквы
        if (/[а-яА-Я]/.test(decoded)) {
          return decoded;
        }
      } catch (e) {
        continue;
      }
    }
    
    return filename;
  } catch (error) {
    console.error('Error decoding filename:', error);
    return filename;
  }
};

// Настройка хранения файлов
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1E9);
    const ext = path.extname(file.originalname);
    
    // Декодируем оригинальное имя файла
    const decodedName = decodeFileName(file.originalname);
    const baseName = path.basename(decodedName, ext);
    
    // Создаем безопасное имя файла
    const safeName = baseName
      .replace(/[^a-zA-Z0-9а-яА-ЯёЁ\s\-_]/g, '_') // Заменяем спецсимволы
      .replace(/\s+/g, '_') // Заменяем пробелы на подчеркивания
      .substring(0, 100); // Ограничиваем длину
    
    cb(null, `${safeName}-${uniqueSuffix}${ext}`);
  },
});

// Фильтр файлов - с явным указанием типа
const fileFilter: multer.Options['fileFilter'] = (req, file, cb) => {
  const allowedTypes = [
    'application/pdf',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'image/jpeg',
    'image/png',
    'text/plain',
  ];
  
  if (allowedTypes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Неподдерживаемый тип файла'));
  }
};

// Создаем middleware для загрузки
export const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB max file size
  },
  fileFilter: fileFilter,
});
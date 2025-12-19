import { Response } from 'express';
import { Document, User, Signature } from '../models';
import { AuthRequest } from '../middleware/auth.middleware';
import { Op } from 'sequelize';
import fs from 'fs';

export const uploadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    if (!req.file) {
      res.status(400).json({ error: 'Файл не был загружен' });
      return;
    }

    const { title, description, deadline } = req.body;

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

    // Декодируем оригинальное имя файла
    const originalFileName = decodeFileName(req.file.originalname);
    
    // Создаем документ в базе данных
    const documentData: any = {
      title: title || originalFileName.replace(/\.[^/.]+$/, ''), // Убираем расширение для title
      description: description || null,
      filePath: req.file.path,
      fileName: originalFileName, // Сохраняем декодированное имя
      fileSize: req.file.size,
      mimeType: req.file.mimetype,
      createdBy: req.user.id,
      status: 'draft',
    };

    if (deadline) {
      documentData.deadline = deadline;
    }

    const document = await Document.create(documentData);

    // Получаем документ с создателем
    const documentWithCreator = await Document.findByPk(document.id, {
      include: [{
        model: User,
        as: 'creator',
        attributes: ['id', 'name', 'email'],
      }],
    });

    res.status(201).json({
      message: 'Документ успешно загружен',
      document: documentWithCreator,
    });
  } catch (error) {
    console.error('Upload document error:', error);
    res.status(500).json({ error: 'Ошибка при загрузке документа' });
  }
};

export const getDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { status, search } = req.query;
    const where: any = {};

    if (status && ['draft', 'active', 'archived'].includes(status as string)) {
      where.status = status;
    }

    if (search) {
      where.title = {
        [Op.iLike]: `%${search}%`,
      };
    }

    const documents = await Document.findAll({
      where,
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Signature,
          as: 'signatures',
          include: [{
            model: User,
            attributes: ['id', 'name', 'email'],
          }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });

    res.json({ documents });
  } catch (error) {
    console.error('Get documents error:', error);
    res.status(500).json({ error: 'Ошибка при получении документов' });
  }
};

export const getDocumentById = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await Document.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Signature,
          as: 'signatures',
          include: [{
            model: User,
            attributes: ['id', 'name', 'email'],
          }],
        },
      ],
    });

    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    res.json({ document });
  } catch (error) {
    console.error('Get document by id error:', error);
    res.status(500).json({ error: 'Ошибка при получении документа' });
  }
};

export const updateDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const { title, description, status, deadline } = req.body;

    const document = await Document.findByPk(id);

    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    // Проверяем права на редактирование
    if (document.createdBy !== req.user?.id && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Недостаточно прав для редактирования документа' });
      return;
    }

    // Обновляем документ
    const updateData: any = {};
    if (title !== undefined) updateData.title = title;
    if (description !== undefined) updateData.description = description;
    if (status !== undefined) updateData.status = status;
    if (deadline !== undefined) updateData.deadline = deadline;

    await document.update(updateData);

    const updatedDocument = await Document.findByPk(id, {
      include: [
        {
          model: User,
          as: 'creator',
          attributes: ['id', 'name', 'email'],
        },
        {
          model: Signature,
          as: 'signatures',
          include: [{
            model: User,
            attributes: ['id', 'name', 'email'],
          }],
        },
      ],
    });

    res.json({
      message: 'Документ успешно обновлен',
      document: updatedDocument,
    });
  } catch (error) {
    console.error('Update document error:', error);
    res.status(500).json({ error: 'Ошибка при обновлении документа' });
  }
};

export const deleteDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await Document.findByPk(id);

    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    // Проверяем права на удаление
    if (req.user?.role !== 'admin' && document.createdBy !== req.user?.id) {
      res.status(403).json({ error: 'Недостаточно прав для удаления документа' });
      return;
    }

    // Удаляем файл
    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

    // Удаляем из базы данных
    await document.destroy();

    res.json({ message: 'Документ успешно удален' });
  } catch (error) {
    console.error('Delete document error:', error);
    res.status(500).json({ error: 'Ошибка при удалении документа' });
  }
};

export const signDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await Document.findByPk(id);

    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    if (document.status !== 'active') {
      res.status(400).json({ error: 'Документ не доступен для подписи' });
      return;
    }

    // Проверяем, не подписал ли уже пользователь этот документ
    const existingSignature = await Signature.findOne({
      where: {
        documentId: id,
        userId: req.user?.id,
      },
    });

    if (existingSignature) {
      res.status(400).json({ error: 'Вы уже подписали этот документ' });
      return;
    }

    // Создаем подпись
    const signatureData = {
      documentId: id,
      userId: req.user!.id,
    };

    const signature = await Signature.create(signatureData);

    res.json({
      message: 'Документ успешно подписан',
      signature,
    });
  } catch (error) {
    console.error('Sign document error:', error);
    res.status(500).json({ error: 'Ошибка при подписи документа' });
  }
};

export const downloadDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;

    const document = await Document.findByPk(id);

    if (!document) {
      res.status(404).json({ error: 'Документ не найден' });
      return;
    }

    if (!fs.existsSync(document.filePath)) {
      res.status(404).json({ error: 'Файл документа не найден' });
      return;
    }

    res.download(document.filePath, document.fileName);
  } catch (error) {
    console.error('Download document error:', error);
    res.status(500).json({ error: 'Ошибка при скачивании документа' });
  }
};
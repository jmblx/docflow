import { Response } from 'express';
import { Document, User, Signature, DocumentWithAssociations } from '../models';
import { AuthRequest } from '../middleware/auth.middleware';
import { sequelize } from '../config/database';
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

    const decodeFileName = (filename: string): string => {
    try {
        if (filename.includes('%')) {
        return decodeURIComponent(filename);
        }

        const encodings: BufferEncoding[] = ['utf8', 'latin1', 'binary'];
        
        for (const encoding of encodings) {
        try {
            const buffer = Buffer.from(filename, 'binary');
            const decoded = buffer.toString(encoding);

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

    const originalFileName = decodeFileName(req.file.originalname);
    
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

    if (document.createdBy !== req.user?.id && req.user?.role !== 'admin') {
      res.status(403).json({ error: 'Недостаточно прав для редактирования документа' });
      return;
    }

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

    if (fs.existsSync(document.filePath)) {
      fs.unlinkSync(document.filePath);
    }

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

export const getDocumentStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const totalDocuments = await Document.count();
    const activeDocuments = await Document.count({ where: { status: 'active' } });
    const draftDocuments = await Document.count({ where: { status: 'draft' } });
    const archivedDocuments = await Document.count({ where: { status: 'archived' } });

    const userSignatures = await Signature.count({ where: { userId: req.user.id } });
    const userSignedDocuments = await Signature.count({ 
      where: { userId: req.user.id },
      distinct: true,
      col: 'documentId'
    });


    let pendingDocuments = 0;
    if (req.user.role === 'user') {

      const activeDocs = await Document.findAll({
        where: { 
          status: 'active',
          createdBy: { [Op.ne]: req.user.id }
        },
        include: [{
          model: Signature,
          as: 'signatures',
          required: false,
        }]
      });

      pendingDocuments = activeDocs.filter(doc => {
        return !doc.signatures || !doc.signatures.some(sig => sig.userId === req.user!.id);
      }).length;
    } 
    else if (req.user.role === 'admin') {
      pendingDocuments = activeDocuments;
    }

    let totalUsers = 0;
    if (req.user.role === 'admin') {
      totalUsers = await User.count();
    }

    const response = {
      totalDocuments,
      activeDocuments,
      draftDocuments,
      archivedDocuments,
      pendingDocuments,
      userStats: {
        totalSigned: userSignatures,
        documentsSigned: userSignedDocuments,
      },
      systemStats: req.user.role === 'admin' ? {
        totalUsers,
        totalDocuments,
      } : null,
    };

    console.log('Document stats:', response);
    
    res.json({ stats: response });
  } catch (error) {
    console.error('Get document stats error:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
  }
};

export const downloadSignedDocuments = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    // Находим все документы, подписанные текущим пользователем
    const signedDocuments = await Document.findAll({
      include: [{
        model: Signature,
        as: 'signatures',
        where: { userId: req.user.id },
        required: true,
      }],
      order: [['createdAt', 'DESC']],
    });

    if (signedDocuments.length === 0) {
      res.status(404).json({ error: 'Нет подписанных документов' });
      return;
    }

    console.log(`Found ${signedDocuments.length} signed documents for user: ${req.user.id}`);

    // Если документ один - отдаем его напрямую
    if (signedDocuments.length === 1) {
      const document = signedDocuments[0];
      console.log(`Single document found: ${document.fileName}, path: ${document.filePath}`);
      
      if (fs.existsSync(document.filePath)) {
        res.download(document.filePath, document.fileName);
      } else {
        console.error(`File not found: ${document.filePath}`);
        res.status(404).json({ 
          error: 'Файл документа не найден',
          details: `Путь: ${document.filePath}`
        });
      }
      return;
    }

    // Если несколько документов - создаем ZIP архив
    try {
      const archiver = require('archiver');
      
      const archive = archiver('zip', {
        zlib: { level: 9 }
      });

      // Настройки ответа
      res.attachment('signed-documents.zip');
      res.setHeader('Content-Type', 'application/zip');

      archive.pipe(res);

      // Добавляем каждый файл в архив
      let filesAdded = 0;
      for (const document of signedDocuments) {
        console.log(`Checking document: ${document.fileName}, path: ${document.filePath}`);
        
        if (fs.existsSync(document.filePath)) {
          archive.file(document.filePath, { name: document.fileName });
          filesAdded++;
          console.log(`Added to archive: ${document.fileName}`);
        } else {
          console.warn(`File not found, skipping: ${document.filePath}`);
        }
      }

      if (filesAdded === 0) {
        console.error('No files found for any documents');
        res.status(404).json({ error: 'Файлы документов не найдены' });
        return;
      }

      console.log(`Total files added to archive: ${filesAdded}`);

      archive.on('error', (err: any) => {
        console.error('Archive error:', err);
        if (!res.headersSent) {
          res.status(500).json({ error: 'Ошибка при создании архива' });
        }
      });

      archive.finalize();
      
    } catch (archiverError: any) {
      console.error('Archiver error, sending first document instead:', archiverError);
      
      const firstDocument = signedDocuments[0];
      if (fs.existsSync(firstDocument.filePath)) {
        res.download(firstDocument.filePath, firstDocument.fileName);
      } else {
        res.status(404).json({ error: 'Файл документа не найден' });
      }
    }

  } catch (error: any) {
    console.error('Download signed documents error:', error);
    res.status(500).json({ 
      error: 'Ошибка при скачивании документов',
      details: error.message 
    });
  }
};

export const getSignatureReport = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.params;
    const userId = req.user?.id;
    
    let whereCondition: any = {};
    if (documentId) {
      whereCondition.id = documentId;
    }
    
    // Проверяем права доступа
    if (req.user?.role !== 'admin') {
      whereCondition.createdBy = userId;
    }
    
    const documents = await Document.findAll({
      where: whereCondition,
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
    }) as DocumentWithAssociations[];
    
    const report = documents.map(doc => ({
      documentId: doc.id,
      documentTitle: doc.title,
      createdBy: doc.createdBy,
      creatorName: doc.creator?.name || '',
      totalSignatures: doc.signatures?.length || 0,
      requiredSignatures: 1,
      signatures: (doc.signatures || []).map(sig => ({
        userId: sig.userId,
        userName: sig.user?.name || '',
        signedAt: sig.signedAt,
      })),
      status: doc.deadline && new Date(doc.deadline) < new Date() 
        ? 'expired' 
        : (doc.signatures?.length || 0) > 0 
          ? 'completed' 
          : 'pending',
    }));
    
    res.json(documentId ? report[0] : report);
  } catch (error) {
    console.error('Get signature report error:', error);
    res.status(500).json({ error: 'Ошибка при получении отчета о подписях' });
  }
};

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    // Общая статистика
    const totalDocuments = await Document.count();
    const totalUsers = await User.count();
    
    // Документы пользователя с подписями
    const userDocuments = await Document.findAll({
      where: { createdBy: userId },
      include: [{
        model: Signature,
        as: 'signatures',
        required: false,
      }],
    }) as DocumentWithAssociations[];
    
    const signedDocuments = userDocuments.filter(doc => 
      doc.signatures?.some(sig => sig.userId === userId)
    ).length;
    
    const pendingDocuments = userDocuments.filter(doc => 
      doc.status === 'active' && 
      !doc.signatures?.some(sig => sig.userId === userId)
    ).length;
    
    // Последние подписи
    const recentSignatures = await Signature.findAll({
      where: { userId },
      include: [
        {
          model: Document,
          attributes: ['id', 'title'],
        },
        {
          model: User,
          attributes: ['id', 'name'],
        },
      ],
      order: [['signedAt', 'DESC']],
      limit: 5,
    });
    
    // Ожидающие действия
    const pendingActions = await Document.findAll({
      where: {
        status: 'active',
        deadline: { [Op.gt]: new Date() },
        [Op.and]: [
          sequelize.literal(`NOT EXISTS (
            SELECT 1 FROM signatures 
            WHERE signatures."documentId" = "Document".id 
            AND signatures."userId" = '${userId}'
          )`)
        ]
      },
      attributes: ['id', 'title', 'deadline'],
      limit: 5,
    });
    
    res.json({
      totalDocuments,
      signedDocuments,
      pendingDocuments,
      totalUsers,
      recentSignatures: recentSignatures.map(sig => ({
        id: sig.id,
        documentTitle: (sig.document as any)?.title,
        userName: (sig.user as any)?.name,
        signedAt: sig.signedAt,
      })),
      pendingActions: pendingActions.map(doc => ({
        id: doc.id,
        documentTitle: doc.title,
        deadline: doc.deadline,
        daysLeft: doc.deadline 
          ? Math.ceil((new Date(doc.deadline).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24))
          : 0,
      })),
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
  }
};
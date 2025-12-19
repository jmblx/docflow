import { Response } from 'express';
import { Document, User, Signature, sequelize } from '../models';
import { AuthRequest } from '../middleware/auth.middleware';
import { Op } from 'sequelize';
import PDFDocument from 'pdfkit';
import fs from 'fs';

export const getDashboardStats = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const userId = req.user?.id;
    
    // Общая статистика
    const totalDocuments = await Document.count();
    const totalUsers = await User.count();
    
    // Документы пользователя
    const userDocuments = await Document.findAll({
      where: { createdBy: userId },
      include: [{
        model: Signature,
        as: 'signatures',
        required: false,
      }],
    });
    
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
        documentTitle: sig.document.title,
        userName: sig.user.name,
        signedAt: sig.signedAt,
      })),
      pendingActions: pendingActions.map(doc => ({
        id: doc.id,
        documentTitle: doc.title,
        deadline: doc.deadline,
        daysLeft: Math.ceil((new Date(doc.deadline!).getTime() - new Date().getTime()) / (1000 * 60 * 60 * 24)),
      })),
    });
  } catch (error) {
    console.error('Get dashboard stats error:', error);
    res.status(500).json({ error: 'Ошибка при получении статистики' });
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
    });
    
    const report = documents.map(doc => ({
      documentId: doc.id,
      documentTitle: doc.title,
      createdBy: doc.createdBy,
      creatorName: doc.creator.name,
      totalSignatures: doc.signatures.length,
      requiredSignatures: 1, // Здесь можно добавить логику для определения требуемого количества
      signatures: doc.signatures.map(sig => ({
        userId: sig.userId,
        userName: sig.user.name,
        signedAt: sig.signedAt,
      })),
      status: doc.deadline && new Date(doc.deadline) < new Date() 
        ? 'expired' 
        : doc.signatures.length > 0 
          ? 'completed' 
          : 'pending',
    }));
    
    res.json(documentId ? report[0] : report);
  } catch (error) {
    console.error('Get signature report error:', error);
    res.status(500).json({ error: 'Ошибка при получении отчета о подписях' });
  }
};

export const downloadSignatureReportPDF = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { documentId } = req.query;
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
          attributes: ['name', 'email'],
        },
        {
          model: Signature,
          as: 'signatures',
          include: [{
            model: User,
            attributes: ['name', 'email'],
          }],
        },
      ],
      order: [['createdAt', 'DESC']],
    });
    
    // Создаем PDF документ
    const doc = new PDFDocument({ margin: 50 });
    
    // Устанавливаем заголовки для скачивания
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', 
      `attachment; filename="signature-report-${documentId || 'all'}.pdf"`
    );
    
    doc.pipe(res);
    
    // Заголовок отчета
    doc.fontSize(20).text('Отчет о подписях документов', { align: 'center' });
    doc.moveDown();
    
    // Дата генерации
    doc.fontSize(10).text(`Сгенерировано: ${new Date().toLocaleString('ru-RU')}`, { align: 'right' });
    doc.moveDown(2);
    
    // Содержимое отчета
    documents.forEach((document, index) => {
      doc.fontSize(14).text(`${index + 1}. ${document.title}`, { underline: true });
      doc.moveDown(0.5);
      
      doc.fontSize(10).text(`Создатель: ${document.creator.name} (${document.creator.email})`);
      doc.text(`Дата создания: ${document.createdAt.toLocaleDateString('ru-RU')}`);
      doc.text(`Статус: ${document.status}`);
      if (document.deadline) {
        doc.text(`Срок подписания: ${new Date(document.deadline).toLocaleDateString('ru-RU')}`);
      }
      doc.moveDown(0.5);
      
      doc.fontSize(12).text('Подписи:');
      if (document.signatures.length > 0) {
        document.signatures.forEach((signature, sigIndex) => {
          doc.fontSize(10).text(`${sigIndex + 1}. ${signature.user.name} (${signature.user.email})`);
          doc.text(`   Дата подписи: ${new Date(signature.signedAt).toLocaleString('ru-RU')}`);
        });
      } else {
        doc.fontSize(10).text('Нет подписей', { color: 'red' });
      }
      
      doc.moveDown(2);
      
      // Разделитель страниц
      if (index < documents.length - 1) {
        doc.addPage();
      }
    });
    
    doc.end();
  } catch (error) {
    console.error('Download signature report error:', error);
    res.status(500).json({ error: 'Ошибка при генерации отчета' });
  }
};

export const downloadSignedDocument = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    const { id } = req.params;
    const userId = req.user?.id;
    
    const document = await Document.findByPk(id, {
      include: [{
        model: Signature,
        as: 'signatures',
        where: { userId },
        required: true,
      }],
    });
    
    if (!document) {
      res.status(404).json({ error: 'Подписанный документ не найден или вы его не подписывали' });
      return;
    }
    
    if (!fs.existsSync(document.filePath)) {
      res.status(404).json({ error: 'Файл документа не найден' });
      return;
    }
    
    // Отправляем файл с оригинальным именем
    res.download(document.filePath, document.fileName);
  } catch (error) {
    console.error('Download signed document error:', error);
    res.status(500).json({ error: 'Ошибка при скачивании подписанного документа' });
  }
};
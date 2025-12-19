import { Request, Response } from 'express';
import { User } from '../models';
import { generateToken } from '../utils/jwt';
import { AuthRequest } from '../middleware/auth.middleware';

export const register = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password, name } = req.body;

    console.log('Registration attempt:', { email, name });

    // Базовая валидация email перед обращением к БД
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(email)) {
      console.log('Invalid email format:', email);
      res.status(400).json({ error: 'Неверный формат email' });
      return;
    }

    // Проверка существования пользователя
    const existingUser = await User.findOne({ where: { email } });
    if (existingUser) {
      console.log('User already exists:', email);
      res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }

    // Создаем пользователя
    const user = await User.create({
      email: email.trim().toLowerCase(), // Нормализуем email
      password,
      name: name.trim(),
      role: 'user', // Первый пользователь будет админом
    });

    // Если это первый пользователь, делаем его админом
    const userCount = await User.count();
    if (userCount === 1) {
      user.role = 'admin';
      await user.save();
      console.log('First user created as admin:', email);
    }

    // Генерируем токен
    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    // Возвращаем ответ без пароля
    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    console.log('User registered successfully:', email);
    
    res.status(201).json({
      token,
      user: userResponse,
    });
  } catch (error: any) {
    console.error('Registration error:', error);
    
    // Обработка ошибок Sequelize
    if (error.name === 'SequelizeValidationError') {
      const messages = error.errors.map((err: any) => {
        if (err.path === 'email' && err.validatorKey === 'isEmail') {
          return 'Неверный формат email';
        }
        return err.message;
      }).join(', ');
      
      res.status(400).json({ error: messages });
      return;
    }
    
    if (error.name === 'SequelizeUniqueConstraintError') {
      res.status(400).json({ error: 'Пользователь с таким email уже существует' });
      return;
    }
    
    // Общая ошибка сервера
    res.status(500).json({ error: 'Ошибка при регистрации' });
  }
};

export const login = async (req: Request, res: Response): Promise<void> => {
  try {
    const { email, password } = req.body;

    console.log('Login attempt:', email);

    const user = await User.findOne({ where: { email } });
    if (!user) {
      console.log('User not found:', email);
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    const isPasswordValid = await user.comparePassword(password);
    if (!isPasswordValid) {
      console.log('Invalid password for:', email);
      res.status(401).json({ error: 'Неверный email или пароль' });
      return;
    }

    const token = generateToken({
      userId: user.id,
      email: user.email,
      role: user.role,
    });

    const userResponse = {
      id: user.id,
      email: user.email,
      name: user.name,
      role: user.role,
      createdAt: user.createdAt,
      updatedAt: user.updatedAt,
    };

    console.log('User logged in successfully:', email);
    
    res.json({
      token,
      user: userResponse,
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ error: 'Ошибка при входе' });
  }
};

export const getCurrentUser = async (req: AuthRequest, res: Response): Promise<void> => {
  try {
    if (!req.user) {
      res.status(401).json({ error: 'Пользователь не авторизован' });
      return;
    }

    const userResponse = {
      id: req.user.id,
      email: req.user.email,
      name: req.user.name,
      role: req.user.role,
      createdAt: req.user.createdAt,
      updatedAt: req.user.updatedAt,
    };

    console.log('Current user fetched:', req.user.email);
    
    res.json({ user: userResponse });
  } catch (error) {
    console.error('Get current user error:', error);
    res.status(500).json({ error: 'Ошибка при получении данных пользователя' });
  }
};
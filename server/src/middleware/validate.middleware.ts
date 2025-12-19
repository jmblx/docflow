import { Request, Response, NextFunction } from 'express';

interface ValidationRule {
  field: string;
  type?: 'email' | 'string' | 'number' | 'date';
  required?: boolean;
  min?: number;
  max?: number;
  pattern?: RegExp;
  patternMessage?: string;
}

export const validate = (rules: ValidationRule[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const errors: Array<{ field: string; message: string }> = [];

    rules.forEach(rule => {
      const value = req.body[rule.field];

      // Проверка на обязательность
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({
          field: rule.field,
          message: `Поле "${rule.field}" обязательно для заполнения`
        });
        return;
      }

      // Если значение есть, проверяем тип
      if (value !== undefined && value !== null && value !== '') {
        // Проверка email
        if (rule.type === 'email') {
          const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
          if (!emailRegex.test(value)) {
            errors.push({
              field: rule.field,
              message: `Поле "${rule.field}" должно быть валидным email`
            });
          }
        }

        // Проверка минимальной длины
        if (rule.min !== undefined && value.length < rule.min) {
          errors.push({
            field: rule.field,
            message: `Поле "${rule.field}" должно содержать минимум ${rule.min} символов`
          });
        }

        // Проверка максимальной длины
        if (rule.max !== undefined && value.length > rule.max) {
          errors.push({
            field: rule.field,
            message: `Поле "${rule.field}" должно содержать максимум ${rule.max} символов`
          });
        }

        // Проверка по регулярному выражению
        if (rule.pattern && !rule.pattern.test(value)) {
          errors.push({
            field: rule.field,
            message: rule.patternMessage || `Поле "${rule.field}" имеет неверный формат`
          });
        }
      }
    });

    if (errors.length > 0) {
      res.status(400).json({ 
        errors,
        message: 'Ошибка валидации'
      });
      return;
    }

    next();
  };
};
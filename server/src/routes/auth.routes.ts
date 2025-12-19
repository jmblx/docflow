import { Router } from 'express';
import { register, login, getCurrentUser } from '../controllers/auth.controller';
import { authenticate } from '../middleware/auth.middleware';
import { validate } from '../middleware/validate.middleware';

const router = Router();

// Роуты
router.post('/register', 
  validate([
    { 
      field: 'email', 
      type: 'email', 
      required: true 
    },
    { 
      field: 'password', 
      required: true,
      min: 6 
    },
    { 
      field: 'name', 
      required: true,
      min: 2 
    },
  ]),
  register
);

router.post('/login',
  validate([
    { 
      field: 'email', 
      type: 'email', 
      required: true 
    },
    { 
      field: 'password', 
      required: true 
    },
  ]),
  login
);

router.get('/me', authenticate, getCurrentUser);

export default router;
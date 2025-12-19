import { DataTypes, Model, Optional } from 'sequelize';
import { sequelize } from '../config/database';
import bcrypt from 'bcryptjs';

// User Model
interface UserAttributes {
  id: string;
  email: string;
  password: string;
  name: string;
  role: 'admin' | 'user';
}

interface UserCreationAttributes extends Optional<UserAttributes, 'id'> {}

export class User extends Model<UserAttributes, UserCreationAttributes> implements UserAttributes {
  public id!: string;
  public email!: string;
  public password!: string;
  public name!: string;
  public role!: 'admin' | 'user';

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;

  public async comparePassword(candidatePassword: string): Promise<boolean> {
    return bcrypt.compare(candidatePassword, this.password);
  }
}

User.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  email: {
    type: DataTypes.STRING,
    allowNull: false,
    unique: true,
    validate: {
      isEmail: true,
    },
  },
  password: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  name: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  role: {
    type: DataTypes.ENUM('admin', 'user'),
    allowNull: false,
    defaultValue: 'user',
  },
}, {
  sequelize,
  tableName: 'users',
  hooks: {
    beforeCreate: async (user: User) => {
      if (user.password) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
    beforeUpdate: async (user: User) => {
      if (user.changed('password')) {
        const salt = await bcrypt.genSalt(10);
        user.password = await bcrypt.hash(user.password, salt);
      }
    },
  },
});

// Document Model
interface DocumentAttributes {
  id: string;
  title: string;
  description?: string;
  filePath: string;
  fileName: string;
  fileSize: number;
  mimeType: string;
  createdBy: string;
  status: 'draft' | 'active' | 'archived';
  deadline?: Date;
}

interface DocumentCreationAttributes extends Optional<DocumentAttributes, 'id'> {}

export class Document extends Model<DocumentAttributes, DocumentCreationAttributes> implements DocumentAttributes {
  public id!: string;
  public title!: string;
  public description?: string;
  public filePath!: string;
  public fileName!: string;
  public fileSize!: number;
  public mimeType!: string;
  public createdBy!: string;
  public status!: 'draft' | 'active' | 'archived';
  public deadline?: Date;

  public readonly createdAt!: Date;
  public readonly updatedAt!: Date;
}

Document.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  title: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  description: {
    type: DataTypes.TEXT,
    allowNull: true,
  },
  filePath: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fileName: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  fileSize: {
    type: DataTypes.INTEGER,
    allowNull: false,
  },
  mimeType: {
    type: DataTypes.STRING,
    allowNull: false,
  },
  createdBy: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
  status: {
    type: DataTypes.ENUM('draft', 'active', 'archived'),
    allowNull: false,
    defaultValue: 'draft',
  },
  deadline: {
    type: DataTypes.DATE,
    allowNull: true,
  },
}, {
  sequelize,
  tableName: 'documents',
});

// Signature Model
interface SignatureAttributes {
  id: string;
  documentId: string;
  userId: string;
}

interface SignatureCreationAttributes extends Optional<SignatureAttributes, 'id'> {}

export class Signature extends Model<SignatureAttributes, SignatureCreationAttributes> implements SignatureAttributes {
  public id!: string;
  public documentId!: string;
  public userId!: string;

  public readonly signedAt!: Date;
}

Signature.init({
  id: {
    type: DataTypes.UUID,
    defaultValue: DataTypes.UUIDV4,
    primaryKey: true,
  },
  documentId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'documents',
      key: 'id',
    },
  },
  userId: {
    type: DataTypes.UUID,
    allowNull: false,
    references: {
      model: 'users',
      key: 'id',
    },
  },
}, {
  sequelize,
  tableName: 'signatures',
  timestamps: true,
  updatedAt: false,
});

// Define associations
Document.belongsTo(User, { foreignKey: 'createdBy', as: 'creator' });
Document.hasMany(Signature, { foreignKey: 'documentId', as: 'signatures' });
Signature.belongsTo(Document, { foreignKey: 'documentId' });
Signature.belongsTo(User, { foreignKey: 'userId' });
User.hasMany(Document, { foreignKey: 'createdBy' });
User.hasMany(Signature, { foreignKey: 'userId' });

export interface JwtUserPayload {
  userId: string;
  email: string;
  role: string;
}

export { sequelize };
export enum UserRole {
  ADMIN = 'admin',
  USER = 'user',
  OPERATOR = 'operator',
}

export interface AppUser {
  id: string;
  email: string;
  role: UserRole;
}

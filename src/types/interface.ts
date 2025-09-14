export interface IUser {
  fullName: string;
  email: string;
  password: string;
  createdAt?: Date;
  id: string;
}

export interface IObject {
  [key: string]: string | any;
}

import { scriptDao } from "../dao/scriptDao";
import { UserDao } from "../dao/userDao";

export default class scriptService {
  static async getScript({
    selectedFeelings,
    selectedEmojis,
    email,
    generatedScripts,
    videoKey,
  }: {
    selectedFeelings: string[];
    selectedEmojis: any;
    email: any;
    generatedScripts: any;
    videoKey?: string | undefined;
  }) {
    await UserDao.update(email, {
      selectedFeelings,
      selectedEmojis,
      generatedScripts,
      videoKey,
    });

    return scriptDao.getScript({ email: email });
  }
}

import { scriptDao } from "../dao/scriptDao";
import { UserDao } from "../dao/userDao";

export default class scriptService {
  static async getScript({
    selectedFeelings,
    selectedEmojis,
    email,
    generatedScripts,
    videoUrl,
  }: {
    selectedFeelings: string[];
    selectedEmojis: any;
    email: any;
    generatedScripts: any;
    videoUrl: any;
  }) {
    UserDao?.update(email, {
      selectedFeelings,
      selectedEmojis,
      generatedScripts,
      videoUrl,
    });

    return scriptDao.getScript({ email: email });
  }
}

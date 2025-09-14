import { scriptDao } from "../dao/scriptDao";
import { UserDao } from "../dao/userDao";

export default class scriptService {
  static async getScript({
    selectedFeelings,
    selectedEmojis,
    userInfo,
    generatedScripts,
    videoUrl,
  }: {
    selectedFeelings: string[];
    selectedEmojis: any;
    userInfo: any;
    generatedScripts: any;
    videoUrl: any;
  }) {
    UserDao?.update(userInfo?.id, {
      selectedFeelings,
      selectedEmojis,
      generatedScripts,
      videoUrl,
    });

    return scriptDao.getScript({ email: userInfo?.email });
  }
}

// queue.js
class Queue {
  constructor() {
    this.tasks = []; // Kuyrukta bekleyen görevler
    this.isProcessing = false; // Kuyruk işleniyor mu?
  }

  // Görev ekle
  add(task) {
    this.tasks.push(task);
    this.process(); // Yeni görev eklendiğinde işlemeye başla
  }

  // Görevleri sırayla işle
  async process() {
    if (this.isProcessing) return; // Zaten işleniyorsa, bekle
    this.isProcessing = true;

    while (this.tasks.length > 0) {
      const task = this.tasks.shift(); // Kuyruktan sıradaki görevi al
      try {
        await task(); // Görevi işle
      } catch (err) {
        console.error("Görev işlenirken hata oluştu:", err);
      }
    }

    this.isProcessing = false; // İşlem bitti
  }
}

module.exports = Queue; // Modülü dışa aktar

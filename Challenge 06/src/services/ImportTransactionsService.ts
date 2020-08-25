import { In, getRepository } from 'typeorm';
import csvParse from 'csv-parse';
import fs from 'fs';

import Transaction from '../models/Transaction';
import Category from '../models/Category';

interface CSVTransaction {
  title: string;
  type: 'income' | 'outcome';
  value: number;
  category: string;
}

class ImportTransactionsService {
  async execute(filePath: string): Promise<Transaction[]> {
    const transactions = await this.loadCSV(filePath);

    return transactions;
  }
  private async loadCSV(filePath: string): Promise<any[]> {
    const readCSVStream = fs.createReadStream(filePath);

    const parseStream = csvParse({
      from_line: 2,
      ltrim: true,
      rtrim: true,
    });

    const parseCSV = readCSVStream.pipe(parseStream);

    const transactions: CSVTransaction[] = [];
    const categories: string[] = [];

    parseCSV.on('data', async line => {
      const [title, type, value, category] = line;

      if (!title || !type || !value) return;

      categories.push(category);
      transactions.push({ title, type, value, category });
    });

    await new Promise(resolve => {
      parseCSV.on('end', resolve);
    });

    const transactionRepository = getRepository(Transaction);
    const categoriesRepository = getRepository(Category);

    const categoriesThatAlreadyExists = await categoriesRepository.find({
      where: {
        title: In(categories),
      },
    });

    const categoriesNamesThatAlreadyExists = categoriesThatAlreadyExists.map(
      category => category.title,
    );

    const categoriesNotYetInDatabase = categories
      .filter(category => {
        return !categoriesNamesThatAlreadyExists.includes(category);
      })
      .filter((value, index, self) => self.indexOf(value) === index);

    const newCategories = categoriesRepository.create(
      categoriesNotYetInDatabase.map(title => ({ title })),
    );

    await categoriesRepository.save(newCategories);

    const finalCategories = [...newCategories, ...categoriesThatAlreadyExists];

    const createdTransactions = transactionRepository.create(
      transactions.map(({ title, type, value, category }) => ({
        title,
        type,
        value,
        category: finalCategories.find(({ title }) => title === category),
      })),
    );

    await transactionRepository.save(createdTransactions);

    await fs.promises.unlink(filePath);
    return createdTransactions;
  }
}

export default ImportTransactionsService;

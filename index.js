const axios = require('axios');

class Bitrix24 {
    constructor(webhookUrl) {
        this.webhookUrl = webhookUrl.trim();
        if (!this.webhookUrl.startsWith('https://')) {
            throw new Error('Webhook URL должен начинаться с https://');
        }

        if (!this.webhookUrl.endsWith('/')) {
            this.webhookUrl += '/';
        }
        
        this.apiClient = axios.create({
            baseURL: this.webhookUrl,
            timeout: 30000,
            headers: {
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            }
        });
        
        this.companies = [];
        this.totalFetched = 0;
    }

    async fetchCompanies(totalNeeded = 10000) {
        console.log(`Начинаем загрузку компаний из Bitrix24...`);
        console.log(`Цель: ${totalNeeded} компаний`);
        console.log(`Webhook: ${this.webhookUrl}`);
        console.log('=' .repeat(50));

        const batchSize = 50; 
        let start = 0;
        
        try {
            while (this.totalFetched < totalNeeded) {
                console.log(`Загружаем компании с ${start + 1} по ${start + batchSize}...`);
                
                const response = await this.apiClient.post('crm.company.list', {
                    order: { "ID": "ASC" },
                    filter: {},
                    select: [
                        "ID", 
                        "TITLE", 
                        "COMPANY_TYPE", 
                        "INDUSTRY", 
                        "REVENUE", 
                        "CURRENCY_ID",
                        "EMPLOYEES",
                        "PHONE",
                        "EMAIL",
                        "DATE_CREATE",
                        "DATE_MODIFY"
                    ],
                    start: start
                });

                if (!response.data || !response.data.result) {
                    console.log('Не получены данные от Bitrix24 или получен пустой ответ');
                    break;
                }

                const companiesBatch = response.data.result;
                
                if (companiesBatch.length === 0) {
                    console.log('Больше компаний нет в базе');
                    break;
                }

                this.companies.push(...companiesBatch);
                this.totalFetched += companiesBatch.length;
                
                console.log(`Загружено: ${this.totalFetched} компаний`);
    
                if (companiesBatch.length < batchSize) {
                    break;
                }
                
                start += batchSize;
       
                await this.sleep(200);
            }

            console.log('=' .repeat(50));
            console.log(`Загрузка завершена!`);
            console.log(`Всего загружено компаний: ${this.totalFetched}`);
            
            return this.companies;

        } catch (error) {
            console.error('Ошибка при загрузке компаний:');
            
            if (error.response) {
                console.error(`Status: ${error.response.status}`);
                console.error(`Data: ${JSON.stringify(error.response.data)}`);
                console.error(`Headers: ${JSON.stringify(error.response.headers)}`);
            } else if (error.request) {
                console.error('Не получен ответ от сервера');
                console.error('Проверьте:');
                console.error('1. Корректность вебхука');
                console.error('2. Доступность Bitrix24');
                console.error('3. Наличие прав у вебхука');
            } else {
                console.error(`Ошибка: ${error.message}`);
            }
            
            throw error;
        }
    }

    displayCompanies(limit = 10) {
        console.log('\n' + '=' .repeat(80));
        console.log('СПИСОК КОМПАНИЙ');
        console.log('=' .repeat(80));
        
        if (this.companies.length === 0) {
            console.log('Нет данных о компаниях');
            return;
        }

        const previewLimit = Math.min(limit, this.companies.length);
        
        console.log(`\nПервые ${previewLimit} компаний (всего: ${this.companies.length}):\n`);
        
        this.companies.slice(0, previewLimit).forEach((company, index) => {
            console.log(`${index + 1}. ${company.TITLE || 'Без названия'} [ID: ${company.ID}]`);
            console.log(`   Тип: ${company.COMPANY_TYPE || 'Не указан'}`);
            console.log(`   Отрасль: ${company.INDUSTRY || 'Не указана'}`);
            console.log(`   Сотрудников: ${company.EMPLOYEES || 'Не указано'}`);
            
            if (company.PHONE && company.PHONE.length > 0) {
                const phones = company.PHONE.map(p => p.VALUE).join(', ');
                console.log(`   Телефоны: ${phones}`);
            }
            
            if (company.EMAIL && company.EMAIL.length > 0) {
                const emails = company.EMAIL.map(e => e.VALUE).join(', ');
                console.log(`   Email: ${emails}`);
            }
            
            console.log(`   Выручка: ${company.REVENUE || 0} ${company.CURRENCY_ID || ''}`);
            console.log(`   Создана: ${company.DATE_CREATE || 'Не указано'}`);
            console.log('-'.repeat(80));
        });
        
        console.log('\n' + '=' .repeat(80));
        console.log('СТАТИСТИКА:');
        console.log('=' .repeat(80));
        
        const typeStats = {};
        const industryStats = {};
        
        this.companies.forEach(company => {
            const type = company.COMPANY_TYPE || 'Не указан';
            const industry = company.INDUSTRY || 'Не указана';
            
            typeStats[type] = (typeStats[type] || 0) + 1;
            industryStats[industry] = (industryStats[industry] || 0) + 1;
        });
        
        console.log('\nРаспределение по типам:');
        Object.entries(typeStats)
            .sort((a, b) => b[1] - a[1])
            .forEach(([type, count]) => {
                console.log(`  ${type}: ${count} (${((count / this.companies.length) * 100).toFixed(1)}%)`);
            });
        
        console.log('\nТоп 5 отраслей:');
        Object.entries(industryStats)
            .sort((a, b) => b[1] - a[1])
            .slice(0, 5)
            .forEach(([industry, count]) => {
                console.log(`  ${industry}: ${count}`);
            });

        this.exportToFile();
    }

    exportToFile() {
        const fs = require('fs');
        const filename = `bitrix24_companies_${new Date().toISOString().split('T')[0]}.json`;
        
        const exportData = {
            metadata: {
                source: "Bitrix24",
                fetchedAt: new Date().toISOString(),
                totalCompanies: this.companies.length,
                webhookUsed: this.webhookUrl
            },
            companies: this.companies
        };
        
        fs.writeFileSync(filename, JSON.stringify(exportData, null, 2), 'utf8');
        console.log(`\n Данные сохранены в файл: ${filename}`);
    }

    sleep(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}

async function main() {
    let webhookUrl = process.argv[2] || process.env.BITRIX24_WEBHOOK;
    
    if (!webhookUrl) {
        console.log('Использование:');
        console.log('  node index.js <webhook_url>');
        console.log('  или');
        console.log('  BITRIX24_WEBHOOK=<webhook_url> node index.js');
        console.log('\nПример:');
        console.log('  node index.js "https://your-domain.bitrix24.ru/rest/1/your-webhook/"');
        console.log('\nГде ваш вебхук Bitrix24 должен иметь права на:');
        console.log('  crm - чтение');
        return;
    }
    
    try {
        const fetcher = new Bitrix24(webhookUrl);
        
        await fetcher.fetchCompanies(10000);
        
        fetcher.displayCompanies(15);
        
    } catch (error) {
        console.error('Программа завершилась с ошибкой');
        process.exit(1);
    }
}

if (require.main === module) {
    main();
}

module.exports = Bitrix24;



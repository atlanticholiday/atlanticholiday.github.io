import { Config } from './config.js';

export class PDFGenerator {
    constructor() {
        this.calculateHoursFromShift = this.calculateHoursFromShift.bind(this);
    }

    generateTeamReportPDF(dataManager) {
        const { jsPDF } = window.jspdf;
        const doc = new jsPDF();

        const month = dataManager.getCurrentDate().getMonth();
        const year = dataManager.getCurrentDate().getFullYear();
        const monthName = Config.MONTHS_OF_YEAR[month];

        doc.setFontSize(18);
        doc.text("Atlantic Holiday", 14, 22);
        doc.setFontSize(14);
        doc.text(`Monthly Team Work Report`, 14, 30);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Period: ${monthName} ${year}`, 14, 36);

        const tableData = dataManager.getActiveEmployees().map(emp => {
            let workDays = 0;
            let vacationDays = 0;
            let extraHoursTotal = 0;
            let extraHoursDetails = [];

            const daysInMonth = new Date(year, month + 1, 0).getDate();
            for (let day = 1; day <= daysInMonth; day++) {
                const date = new Date(year, month, day);
                const status = dataManager.getEmployeeStatusForDate(emp, date);
                const dateKey = dataManager.getDateKey(date);
                
                if (status === 'Working') workDays++;
                if (status === 'On Vacation') vacationDays++;
                
                if (emp.extraHours && emp.extraHours[dateKey]) {
                    const hours = emp.extraHours[dateKey];
                    extraHoursTotal += hours;
                    extraHoursDetails.push(`- Day ${day}: ${hours} hrs`);
                }
            }
            
            return [
                emp.name,
                workDays,
                vacationDays,
                extraHoursTotal.toFixed(1),
                extraHoursDetails.join('\n')
            ];
        });

        doc.autoTable({
            head: [['Employee', 'Work Days', 'Vacation Days', 'Total Extra Hrs', 'Extra Hours Details']],
            body: tableData,
            startY: 42,
            theme: 'grid',
            headStyles: { fillColor: [233, 75, 90] },
            styles: { cellPadding: 2.5, fontSize: 9 },
            columnStyles: {
                0: { cellWidth: 35 },
                1: { cellWidth: 20, halign: 'center' },
                2: { cellWidth: 25, halign: 'center' },
                3: { cellWidth: 28, halign: 'center' },
                4: { cellWidth: 'auto' },
            }
        });

        doc.save(`Team_Report_${monthName}_${year}.pdf`);
    }

    generateIndividualReportPDF(employeeId, dataManager) {
        const emp = dataManager.getActiveEmployees().find(e => e.id === employeeId);
        if (!emp) return;

        const { jsPDF } = window.jspdf;
        const doc = new jsPDF({ orientation: 'p', unit: 'mm', format: 'a4' });
        
        const month = dataManager.getCurrentDate().getMonth();
        const year = dataManager.getCurrentDate().getFullYear();
        const monthName = Config.MONTHS_OF_YEAR[month];

        // Page dimensions and theme colors
        const pageHeight = 297;
        const pageWidth = 210;
        const margin = 15;
        const brandColor = [233, 75, 90];
        const softGray = [248, 250, 252];
        const textDark = [29, 29, 31];
        const textGray = [107, 114, 128];

        // Beautiful gradient background
        doc.setFillColor(250, 250, 252);
        doc.rect(0, 0, pageWidth, pageHeight, 'F');
        
        // Add subtle brand accent rectangles with very light colors
        doc.setFillColor(253, 242, 244); // Very light brand color
        doc.rect(0, 0, pageWidth, 40, 'F');  // Much smaller header area
        doc.rect(0, pageHeight - 25, pageWidth, 25, 'F');  // Smaller footer area

        // Compact modern header with brand styling
        doc.setFillColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.rect(margin, 10, pageWidth - (margin * 2), 30, 'F');  // Much smaller header

        // Header text - Atlantic Holiday branding
        doc.setTextColor(255, 255, 255);
        doc.setFontSize(18);  // Smaller font
        doc.setFont('helvetica', 'bold');
        doc.text('Atlantic Holiday', pageWidth / 2, 22, { align: 'center' });
        
        doc.setFontSize(11);  // Smaller subtitle
        doc.setFont('helvetica', 'normal');
        doc.text('Monthly Hours Report', pageWidth / 2, 30, { align: 'center' });
        
        // Decorative line under header
        doc.setDrawColor(255, 255, 255);
        doc.setLineWidth(0.3);
        doc.line(margin + 15, 35, pageWidth - margin - 15, 35);

        // Employee info card with glass effect - moved up
        const infoY = 50;
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, infoY, pageWidth - (margin * 2), 20, 'F');  // Smaller info card
        
        doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.setLineWidth(0.3);
        doc.rect(margin, infoY, pageWidth - (margin * 2), 20, 'S');

        // Employee details with modern typography
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.setFontSize(10);
        doc.setFont('helvetica', 'bold');
        doc.text(`Employee: ${emp.name}`, margin + 6, infoY + 7);
        doc.text(`Period: ${monthName} ${year}`, pageWidth - margin - 6, infoY + 7, { align: 'right' });
        
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        doc.text(`Staff ID: ${emp.staffNumber || 'N/A'}`, margin + 6, infoY + 14);
        doc.text(`Generated: ${new Date().toLocaleDateString('en-GB')}`, pageWidth - margin - 6, infoY + 14, { align: 'right' });

        // Process work data
        const daysInMonth = new Date(year, month + 1, 0).getDate();
        const tableData = [];
        let weeklyTotals = [];
        let currentWeekHours = 0;
        let monthlyTotal = 0;
        
        for (let day = 1; day <= daysInMonth; day++) {
            const date = new Date(year, month, day);
            const dayOfWeek = date.getDay();

            if (dataManager.getEmployeeStatusForDate(emp, date) === 'Working') {
                const shift = (emp.shifts && emp.shifts[dayOfWeek]) || (emp.shifts && emp.shifts.default) || '9:00-18:00';
                const hours = this.calculateHoursFromShift(shift);
                currentWeekHours += hours;
                monthlyTotal += hours;

                tableData.push([
                    date.toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit' }),
                    Config.DAYS_OF_WEEK[dayOfWeek],
                    shift,
                    hours.toFixed(1)
                ]);
            }

            if (dayOfWeek === 6 || day === daysInMonth) {
                if (currentWeekHours > 0) {
                    weeklyTotals.push(currentWeekHours);
                }
                currentWeekHours = 0;
            }
        }

        // Dynamic sizing for single page
        const availableHeight = pageHeight - 80 - 60; // Reduced header + footer space
        const estimatedTableHeight = (tableData.length + 1) * 5;
        
        let tableFontSize = 9;
        let cellPadding = 1.5;
        
        if (estimatedTableHeight > availableHeight * 0.65) {
            tableFontSize = 8;
            cellPadding = 1.2;
        }

        // Extended table using full page width
        doc.autoTable({
            head: [['Date', 'Day', 'Shift Time', 'Hours']],
            body: tableData,
            startY: 78,  // Moved up due to smaller header
            theme: 'striped',
            headStyles: { 
                fillColor: [brandColor[0], brandColor[1], brandColor[2]],
                textColor: [255, 255, 255],
                fontSize: 10,
                fontStyle: 'bold',
                cellPadding: 2.5,
                halign: 'center'
            },
            alternateRowStyles: {
                fillColor: [248, 250, 252]
            },
            styles: { 
                cellPadding: cellPadding,
                fontSize: tableFontSize,
                halign: 'center',
                textColor: [29, 29, 31],
                lineColor: [229, 231, 235],
                lineWidth: 0.2
            },
            columnStyles: {
                0: { 
                    cellWidth: 40,  // Wider date column
                    fontStyle: 'bold'
                },
                1: { 
                    cellWidth: 45,  // Wider day column
                    textColor: [107, 114, 128]
                },
                2: { 
                    cellWidth: 55   // Much wider shift column
                },
                3: { 
                    cellWidth: 35,  // Wider hours column
                    fontStyle: 'bold',
                    textColor: [brandColor[0], brandColor[1], brandColor[2]]
                }
            },
            margin: { left: margin, right: margin },
            tableWidth: 'wrap'
        });

        // Compact summary section
        let summaryY = Math.max(doc.lastAutoTable.finalY + 15, pageHeight - 70);
        
        // Summary header
        doc.setFontSize(14);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text('Work Summary', margin, summaryY);
        
        // Decorative underline for summary
        doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.setLineWidth(1);
        doc.line(margin, summaryY + 2, margin + 35, summaryY + 2);

        summaryY += 10;

        // Create summary cards layout - smaller cards
        const cardWidth = (pageWidth - (margin * 2) - 8) / 2;
        let cardX = margin;
        
        // Weekly totals card
        doc.setFillColor(255, 255, 255);
        doc.rect(cardX, summaryY, cardWidth, 20, 'F');  // Smaller card
        
        doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.setLineWidth(0.3);
        doc.rect(cardX, summaryY, cardWidth, 20, 'S');

        doc.setFontSize(8);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text('Weekly Breakdown', cardX + 3, summaryY + 5);
        
        doc.setFont('helvetica', 'normal');
        doc.setFontSize(7);
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        weeklyTotals.forEach((hours, i) => {
            doc.text(`Week ${i+1}: ${hours.toFixed(1)}h`, cardX + 3, summaryY + 9 + (i * 2.5));
        });

        // Monthly total card
        cardX = margin + cardWidth + 8;
        doc.setFillColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.rect(cardX, summaryY, cardWidth, 20, 'F');

        doc.setFontSize(9);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(255, 255, 255);
        doc.text('Monthly Total', cardX + 3, summaryY + 7);
        
        doc.setFontSize(14);
        doc.text(`${monthlyTotal.toFixed(1)} hours`, cardX + 3, summaryY + 15);

        // IMPORTANT: Signature section - ensure it's always visible and has proper space
        let signatureY = Math.max(summaryY + 30, pageHeight - 50);
        
        // Ensure signature doesn't go off page
        if (signatureY > pageHeight - 40) {
            signatureY = pageHeight - 40;
        }
        
        // Signature background
        doc.setFillColor(255, 255, 255);
        doc.rect(margin, signatureY, pageWidth - (margin * 2), 30, 'F');
        
        doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.setLineWidth(0.3);
        doc.rect(margin, signatureY, pageWidth - (margin * 2), 30, 'S');

        // Signature header
        doc.setFontSize(11);
        doc.setFont('helvetica', 'bold');
        doc.setTextColor(textDark[0], textDark[1], textDark[2]);
        doc.text('Employee Confirmation', margin + 5, signatureY + 6);
        
        // Confirmation text
        doc.setFontSize(8);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        doc.text('I confirm that the above working hours are accurate and complete.', margin + 5, signatureY + 12);
        
        // Signature lines - ensure plenty of space for signing
        doc.setDrawColor(brandColor[0], brandColor[1], brandColor[2]);
        doc.setLineWidth(0.5);
        doc.line(margin + 5, signatureY + 20, margin + 95, signatureY + 20);  // Employee signature line
        doc.line(pageWidth - margin - 75, signatureY + 20, pageWidth - margin - 5, signatureY + 20);  // Date line

        // Labels below signature lines
        doc.setFontSize(7);
        doc.setFont('helvetica', 'normal');
        doc.setTextColor(textGray[0], textGray[1], textGray[2]);
        doc.text('Employee Signature', margin + 5, signatureY + 25);
        doc.text('Date', pageWidth - margin - 75, signatureY + 25);

        doc.save(`Hours_Report_${emp.name.replace(/\s+/g, '_')}_${monthName}_${year}.pdf`);
    }

    calculateHoursFromShift(shift) {
        if (!shift) return 8; // Default 8 hours if no shift specified
        
        try {
            const [startTime, endTime] = shift.split('-');
            if (!startTime || !endTime) return 8;
            
            const [startHour, startMin = 0] = startTime.split(':').map(num => parseInt(num));
            const [endHour, endMin = 0] = endTime.split(':').map(num => parseInt(num));
            
            if (isNaN(startHour) || isNaN(endHour)) return 8;
            
            const startMinutes = startHour * 60 + startMin;
            const endMinutes = endHour * 60 + endMin;
            
            let totalMinutes = endMinutes - startMinutes;
            if (totalMinutes < 0) totalMinutes += 24 * 60; // Handle overnight shifts
            
            const totalHours = totalMinutes / 60;
            
            // Subtract 1 hour for lunch break if shift is longer than 6 hours
            return totalHours > 6 ? totalHours - 1 : totalHours;
        } catch (error) {
            console.warn('Error calculating hours from shift:', shift, error);
            return 8; // Default fallback
        }
    }
} 